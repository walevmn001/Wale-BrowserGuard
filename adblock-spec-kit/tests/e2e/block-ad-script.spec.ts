import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Must match the E2E fixture line in rules/source/ads.txt. */
const BLOCKED_HOST = 'ads.example.test';

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>block e2e</title>
    <script src="/app.js"></script>
    <script src="http://${BLOCKED_HOST}/ad.js"></script>
  </head>
  <body>
    ok
  </body>
</html>`;

let context!: BrowserContext;
let server!: Server;
let baseUrl!: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/app.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end('window.__appLoaded = true;');
      return;
    }
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

function appLoaded(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __appLoaded?: boolean }).__appLoaded ?? false);
}

test('blocks a known ad script while same-origin scripts still load', async () => {
  const page = await context.newPage();

  const blocked = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().includes(BLOCKED_HOST),
  });

  await page.goto(baseUrl);

  const failure = await blocked;
  expect(failure.failure()?.errorText).toContain('ERR_BLOCKED_BY_CLIENT');
  await expect.poll(() => appLoaded(page)).toBe(true);
});
