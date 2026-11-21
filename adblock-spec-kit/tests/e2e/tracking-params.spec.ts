import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let context!: BrowserContext;
let server!: Server;
let port!: number;
let baseUrl!: string;
/**
 * Path + query of every request the plain-http server actually served. The
 * privacy ruleset's `removeParams` redirect rewrites the URL before it leaves
 * the browser, so a stripped URL reaches the server and the dirty one never
 * does — that difference is what the tests assert.
 */
let pathsSeen: string[] = [];

function pageHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>tracking params e2e</title>
  </head>
  <body>
    <img id="pixel" src="/img?utm_source=newsletter&fbclid=IwAR123&keep=1" />
  </body>
</html>`;
}

function imgWidth(page: Page, selector: string): Promise<number> {
  return page.$eval(selector, (element) => (element as HTMLImageElement).naturalWidth);
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = request.url ?? '/';
    pathsSeen.push(url);
    if (url.startsWith('/img')) {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(PNG_1X1);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(pageHtml());
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}/`;

  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      // Keep Chromium off the sandbox HTTP(S)_PROXY, which would hang the load.
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

test('strips tracking parameters from a sub-resource request', async () => {
  pathsSeen = [];
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'load' });

  // The image still loads, so stripping did not break the request.
  await expect.poll(() => imgWidth(page, '#pixel')).toBeGreaterThan(0);
  // The server only ever sees the cleaned URL.
  await expect.poll(() => pathsSeen.some((url) => url.startsWith('/img?'))).toBe(true);
  expect(pathsSeen).toContain('/img?keep=1');
  expect(pathsSeen.some((url) => url.includes('utm_source') || url.includes('fbclid'))).toBe(false);
});

test('strips tracking parameters from a navigation', async () => {
  pathsSeen = [];
  const page = await context.newPage();
  await page.goto(`${baseUrl}landing?utm_source=email&gclid=abc&id=7`, { waitUntil: 'load' });

  // The strip happens in the network stack, so the address bar keeps the URL the
  // user typed while the server only ever receives the cleaned one.
  expect(pathsSeen).toContain('/landing?id=7');
  expect(pathsSeen.some((url) => url.includes('utm_source') || url.includes('gclid'))).toBe(false);
});

test('leaves a clean URL untouched', async () => {
  pathsSeen = [];
  const page = await context.newPage();
  await page.goto(`${baseUrl}landing?id=7`, { waitUntil: 'load' });

  // `removeParams` rewrites nothing here and DNR skips a redirect that would not
  // change the URL, so the address bar keeps the clean URL…
  expect(page.url()).toBe(`${baseUrl}landing?id=7`);
  // …and the document is fetched exactly once, unmodified.
  const landings = pathsSeen.filter((url) => url.startsWith('/landing'));
  expect(landings).toEqual(['/landing?id=7']);
});
