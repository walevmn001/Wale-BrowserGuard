import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Must match the E2E fixture line in rules/source/ads.txt. */
const BLOCKED_HOST = 'ads.example.test';

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>master switch e2e</title>
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

test('turning the master switch off disables the rulesets and stops blocking', async () => {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // On by default: the manifest's static rulesets are enabled.
  expect(
    await worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()),
  ).not.toEqual([]);

  await worker.evaluate(() => chrome.storage.local.set({ enabled: false }));

  // The worker reacts to the storage change and disables every static ruleset.
  await expect
    .poll(() => worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()))
    .toEqual([]);

  // The ad request now reaches the network layer instead of being blocked.
  const page = await context.newPage();
  const failed = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().includes(BLOCKED_HOST),
  });
  await page.goto(baseUrl);
  const errorText = (await failed).failure()?.errorText ?? '';

  expect(errorText).not.toContain('ERR_BLOCKED_BY_CLIENT');
  expect(errorText.length).toBeGreaterThan(0);
});
