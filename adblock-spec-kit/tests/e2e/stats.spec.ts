import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Must match the E2E fixture line in rules/source/ads.txt. */
const BLOCKED_HOST = 'ads.example.test';
/** Number of ad scripts the page pulls in; each one should be counted. */
const AD_SCRIPTS = 3;

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>stats e2e</title>
    ${Array.from(
      { length: AD_SCRIPTS },
      (_value, index) => `<script src="http://${BLOCKED_HOST}/ad${index}.js"></script>`,
    ).join('\n    ')}
  </head>
  <body>
    ok
  </body>
</html>`;

interface Stats {
  readonly total: number;
  readonly byTab: Record<string, number>;
}

let context!: BrowserContext;
let server!: Server;
let baseUrl!: string;

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(PAGE_HTML);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/`;

  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((done) => server.close(() => done()));
});

function readStats(worker: Worker): Promise<Stats> {
  return worker.evaluate(async () => {
    const stored = await chrome.storage.local.get(['statsTotal', 'statsByTab']);
    return {
      total: (stored['statsTotal'] as number | undefined) ?? 0,
      byTab: (stored['statsByTab'] as Record<string, number> | undefined) ?? {},
    };
  });
}

test('counts the blocked requests per tab and in total', async () => {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  const page = await context.newPage();
  await page.goto(baseUrl);

  // The worker polls the block counter after the page finishes loading.
  await expect.poll(() => readStats(worker).then((stats) => stats.total)).toBe(AD_SCRIPTS);

  const stats = await readStats(worker);
  expect(Object.values(stats.byTab).reduce((sum, count) => sum + count, 0)).toBe(AD_SCRIPTS);

  // Every match came from the page we just opened.
  const tabId = await worker.evaluate(async (url) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((tab) => tab.url?.startsWith(url))?.id;
  }, baseUrl);
  expect(tabId).toBeDefined();
  expect(stats.byTab[String(tabId)]).toBe(AD_SCRIPTS);
});
