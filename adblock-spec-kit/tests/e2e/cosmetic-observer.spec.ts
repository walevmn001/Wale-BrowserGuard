import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** A page with no ads; the test injects one *after* load (T022). */
const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>cosmetic observer e2e</title>
  </head>
  <body>
    <div class="content">real content</div>
  </body>
</html>`;

type CdpSession = Awaited<ReturnType<BrowserContext['newCDPSession']>>;

let context!: BrowserContext;
let server!: Server;
let port!: number;

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(PAGE_HTML);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;

  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      // The sandbox has HTTP(S)_PROXY set; without this flag a request to a
      // bare host would be sent to the proxy and `page.goto` would hang.
      '--no-proxy-server',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((done) => server.close(() => done()));
});

function display(page: Page, selector: string): Promise<string> {
  return page.$eval(selector, (element) => getComputedStyle(element).display);
}

async function taskDuration(session: CdpSession): Promise<number> {
  const { metrics } = await session.send('Performance.getMetrics');
  return metrics.find((metric) => metric.name === 'TaskDuration')?.value ?? 0;
}

test('pins an ad injected after load, even against an inline !important (AC-4.2)', async () => {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);

  // The injected stylesheet hides `.ad-banner`, but an inline
  // `display: block !important` outranks it — only the page-side observer can
  // pin this element, which proves the observer was really attached.
  await page.evaluate(() => {
    const ad = document.createElement('div');
    ad.className = 'ad-banner';
    ad.setAttribute('style', 'display: block !important');
    ad.textContent = 'late ad';
    document.body.append(ad);
  });

  const start = Date.now();
  await expect.poll(() => display(page, '.ad-banner'), { timeout: 1000 }).toBe('none');
  expect(Date.now() - start).toBeLessThanOrEqual(1000);
});

test('keeps renderer CPU under 5% while the page is idle (AC-4.3)', async () => {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  // Let the observer install and the initial scan settle before measuring.
  await page.waitForTimeout(500);

  const session = await context.newCDPSession(page);
  await session.send('Performance.enable');
  const before = await taskDuration(session);
  const windowMs = 2000;
  await page.waitForTimeout(windowMs);
  const after = await taskDuration(session);
  await session.detach();

  // `TaskDuration` is cumulative renderer CPU in seconds; a dormant observer
  // must keep it below 5% of the wall-clock window (algorithm.md §D).
  const cpuFraction = (after - before) / (windowMs / 1000);
  expect(cpuFraction).toBeLessThan(0.05);
});
