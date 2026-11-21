import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/**
 * A public-looking host whose insecure sub-resource must be upgraded to https
 * (algorithm.md §G). It is mapped to the local server by `--host-resolver-rules`.
 */
const UPGRADE_HOST = 'upgrade.example.test';

/** A host the rule must leave alone (localhost is in the "no upgrade" set). */
const PLAIN_HOST = 'localhost';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let context!: BrowserContext;
let server!: Server;
let port!: number;
let baseUrl!: string;
/** Host headers of every request that actually reached the plain-http server. */
let hostsSeen: string[] = [];

function pageHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>https upgrade e2e</title>
  </head>
  <body>
    <img id="upgraded" src="http://${UPGRADE_HOST}:${port}/px.png" />
    <img id="plain" src="http://${PLAIN_HOST}:${port}/px.png" />
  </body>
</html>`;
}

function imgWidth(page: Page, selector: string): Promise<number> {
  return page.$eval(selector, (element) => (element as HTMLImageElement).naturalWidth);
}

/**
 * Every request the browser makes to `UPGRADE_HOST` is rewritten to https with
 * the same host:port. Since this server only speaks plain http, the TLS
 * handshake against it fails — so an upgraded request never reaches the handler
 * below, while a non-upgraded one does. That difference is exactly what the test
 * asserts.
 */
test.beforeAll(async () => {
  server = createServer((request, response) => {
    hostsSeen.push(request.headers.host ?? '');
    if (request.url === '/px.png') {
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
      `--host-resolver-rules=MAP ${UPGRADE_HOST} 127.0.0.1, MAP ${PLAIN_HOST} 127.0.0.1`,
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((done) => server.close(() => done()));
});

test('upgrades an insecure sub-resource to https and never loops', async () => {
  hostsSeen = [];
  const page = await context.newPage();
  const attempts: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes(UPGRADE_HOST)) {
      attempts.push(request.url());
    }
  });

  await page.goto(baseUrl, { waitUntil: 'load' });

  // The localhost image is not upgraded: it loads over plain http.
  await expect.poll(() => imgWidth(page, '#plain')).toBeGreaterThan(0);
  // The public-looking image is upgraded: the browser retries it over https.
  await expect.poll(() => attempts.some((url) => url.startsWith('https://'))).toBe(true);

  // Proof the scheme was rewritten: the browser first requests the http URL and
  // then, because the rule upgraded it, the https one — while the plain-http
  // server served localhost but never saw the upgraded host. Getting exactly
  // those two attempts (and not a growing list) is the "no infinite loop" check.
  expect(hostsSeen.some((host) => host.startsWith(PLAIN_HOST))).toBe(true);
  expect(hostsSeen.some((host) => host.includes(UPGRADE_HOST))).toBe(false);
  expect(attempts).toEqual([
    `http://${UPGRADE_HOST}:${port}/px.png`,
    `https://${UPGRADE_HOST}:${port}/px.png`,
  ]);

  // The upgraded image cannot load from a plain-http port.
  expect(await imgWidth(page, '#upgraded')).toBe(0);
});
