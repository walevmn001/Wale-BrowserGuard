import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/**
 * `rules/source/cosmetic.txt` hides `.ad-banner` generically, hides `.promo-box`
 * only on `example.org`, and cancels the banner there via `example.org#@#.ad-banner`.
 */
const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>cosmetic e2e</title>
  </head>
  <body>
    <div class="ad-banner">banner</div>
    <div class="promo-box">promo</div>
    <div class="content">real content</div>
  </body>
</html>`;

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
      '--no-proxy-server',
      '--host-resolver-rules=MAP example.org 127.0.0.1',
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

test('hides a leftover banner while keeping real content visible', async () => {
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);

  await expect.poll(() => display(page, '.ad-banner')).toBe('none');
  // `.promo-box` is domain-scoped to example.org, so it stays visible here.
  await expect.poll(() => display(page, '.promo-box')).not.toBe('none');
  await expect.poll(() => display(page, '.content')).not.toBe('none');
});

test('honours the per-domain override and its #@# exception', async () => {
  const page = await context.newPage();
  await page.goto(`http://example.org:${port}/`);

  await expect.poll(() => display(page, '.promo-box')).toBe('none');
  // The generic `.ad-banner` hide is cancelled by `example.org#@#.ad-banner`.
  await expect.poll(() => display(page, '.ad-banner')).not.toBe('none');
});
