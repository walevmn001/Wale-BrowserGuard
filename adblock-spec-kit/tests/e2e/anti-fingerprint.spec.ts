import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The host the served page runs under; also the key of the per-page switch. */
const PAGE_HOST = '127.0.0.1';

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>anti-fingerprint e2e</title>
  </head>
  <body>
    sample
  </body>
</html>`;

let context!: BrowserContext;
let server!: Server;
let pageUrl!: string;

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(PAGE_HTML);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  pageUrl = `http://${PAGE_HOST}:${port}/`;

  context = await chromium.launchPersistentContext('', {
    headless: false,
    // `--no-proxy-server` keeps Chromium from honouring the sandbox's
    // HTTP(S)_PROXY env, which would otherwise hang the navigation.
    args: [
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

function workerOf(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0]
    ? Promise.resolve(context.serviceWorkers()[0]!)
    : context.waitForEvent('serviceworker');
}

/**
 * The MAIN-world marker the reducer sets, read from the page's own world so it
 * observes exactly what the page's scripts do; `null` means it never ran.
 */
function readFlag(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const flag = (window as unknown as Record<string, unknown>)['__adblockAntiFingerprint'];
    return flag === true ? true : null;
  });
}

test('anti-fingerprinting is off by default: the reducer never runs (AC-6.5)', async () => {
  const page = await context.newPage();
  await page.goto(pageUrl);
  await expect(page.locator('body')).toContainText('sample');

  // Nothing was injected into the page's MAIN world.
  await expect.poll(() => readFlag(page)).toBeNull();
  await page.close();
});

test('enabling it trims the fingerprint surface in the MAIN world (AC-6.5)', async () => {
  const worker = await workerOf(context);
  await worker.evaluate(() => chrome.storage.local.set({ antiFingerprint: true }));

  const page = await context.newPage();
  await page.goto(pageUrl);

  // The worker injects on `tabs.onUpdated` once the navigation completes.
  await expect.poll(() => readFlag(page)).toBe(true);
  await expect.poll(() => page.evaluate(() => navigator.hardwareConcurrency)).toBe(2);
  await expect
    .poll(() => page.evaluate(() => (navigator as { deviceMemory?: number }).deviceMemory))
    .toBe(4);
  await expect.poll(() => page.evaluate(() => navigator.plugins.length)).toBe(0);
  await page.close();
});

test('the per-page switch skips a host on the off list (AC-6.5)', async () => {
  const worker = await workerOf(context);
  await worker.evaluate(
    (host) => chrome.storage.local.set({ antiFingerprintOffSites: [host] }),
    PAGE_HOST,
  );

  const page = await context.newPage();
  await page.goto(pageUrl);
  // Give the worker the same window it had in the enabled case, then assert it
  // stayed away because the host is switched off.
  await page.waitForTimeout(500);

  const enabled = await worker.evaluate(() =>
    chrome.storage.local.get('antiFingerprint').then((stored) => stored['antiFingerprint']),
  );
  expect(enabled).toBe(true);
  await expect.poll(() => readFlag(page)).toBeNull();
  await page.close();
});
