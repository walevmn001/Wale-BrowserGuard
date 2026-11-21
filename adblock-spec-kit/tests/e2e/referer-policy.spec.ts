import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/**
 * Loopback IPs as stand-ins for sites: `127.0.0.1` is the page, `127.0.0.2` a
 * different site (a distinct IP is a distinct site), so a request to it is
 * third-party. IP literals also never match the https-upgrade rule (`[a-z]{2,}`
 * needs a dotted host), which keeps this test about the Referer header only.
 */
const PAGE_HOST = '127.0.0.1';
const SAME_SITE_HOST = '127.0.0.1';
const THIRD_PARTY_HOST = '127.0.0.2';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface Seen {
  readonly host: string;
  readonly path: string;
  readonly referer: string | undefined;
}

let context!: BrowserContext;
let server!: Server;
let port!: number;
let baseUrl!: string;
/** Every request the server handled, with the host/path/referer it arrived with. */
let seen: Seen[] = [];

function pageHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>referer policy e2e</title>
  </head>
  <body>
    <img id="same" src="http://${SAME_SITE_HOST}:${port}/px.png?same" />
    <img id="third" src="http://${THIRD_PARTY_HOST}:${port}/px.png?third" />
    <a id="go" href="http://${THIRD_PARTY_HOST}:${port}/landing">go</a>
  </body>
</html>`;
}

function imgWidth(page: Page, selector: string): Promise<number> {
  return page.$eval(selector, (element) => (element as HTMLImageElement).naturalWidth);
}

function requestTo(pathPrefix: string, host: string): Seen | undefined {
  return seen.find((entry) => entry.path.startsWith(pathPrefix) && entry.host.startsWith(host));
}

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = request.url ?? '/';
    seen.push({
      host: request.headers.host ?? '',
      path: url,
      referer: request.headers.referer,
    });
    if (url.startsWith('/px.png')) {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(PNG_1X1);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(url.startsWith('/landing') ? '<!doctype html><title>landing</title><p>ok' : pageHtml());
  });
  // Bind every interface so both 127.0.0.1 and 127.0.0.2 reach the server.
  await new Promise<void>((done) => server.listen(0, '0.0.0.0', done));
  port = (server.address() as AddressInfo).port;
  baseUrl = `http://${PAGE_HOST}:${port}/`;

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

test('drops the Referer header from a third-party sub-resource', async () => {
  seen = [];
  const page = await context.newPage();
  await page.goto(`${baseUrl}page`, { waitUntil: 'load' });
  await expect.poll(() => imgWidth(page, '#third')).toBeGreaterThan(0);

  const third = requestTo('/px.png?third', THIRD_PARTY_HOST);
  expect(third).toBeDefined();
  // Without the rule the browser would still send `http://publisher.org:<port>/`.
  expect(third?.referer).toBeUndefined();
});

test('keeps the Referer header on a same-site sub-resource', async () => {
  seen = [];
  const page = await context.newPage();
  await page.goto(`${baseUrl}page`, { waitUntil: 'load' });
  await expect.poll(() => imgWidth(page, '#same')).toBeGreaterThan(0);

  const same = requestTo('/px.png?same', SAME_SITE_HOST);
  expect(same).toBeDefined();
  expect(same?.referer).toContain(PAGE_HOST);
});

test('keeps the Referer header on a top-level navigation', async () => {
  seen = [];
  const page = await context.newPage();
  await page.goto(`${baseUrl}link`, { waitUntil: 'load' });
  await page.click('#go');
  await page.waitForURL(`http://${THIRD_PARTY_HOST}:${port}/landing`);

  // The rule targets sub-resources only, so a cross-site navigation still
  // carries its referer (many redirect/hotlink flows depend on it).
  const navigation = requestTo('/landing', THIRD_PARTY_HOST);
  expect(navigation).toBeDefined();
  expect(navigation?.referer).toContain(PAGE_HOST);
});
