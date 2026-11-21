import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Must match the E2E fixture line in rules/source/ads.txt. */
const BLOCKED_HOST = 'ads.example.test';
/** The page is served under this domain so it can be whitelisted by name. */
const SITE_DOMAIN = 'localhost';
/** Number of ad scripts the page pulls in; each one should be counted. */
const AD_SCRIPTS = 2;

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>popup e2e</title>
    ${Array.from(
      { length: AD_SCRIPTS },
      (_value, index) => `<script src="http://${BLOCKED_HOST}/ad${index}.js"></script>`,
    ).join('\n    ')}
  </head>
  <body>
    ok
  </body>
</html>`;

let context!: BrowserContext;
let server!: Server;
let baseUrl!: string;
let popupUrl!: string;
let worker!: Worker;

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(PAGE_HTML);
  });
  // Bind on every interface so `localhost` (v4/v6) resolves to us.
  await new Promise<void>((done) => server.listen(0, done));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://${SITE_DOMAIN}:${port}/`;

  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  popupUrl = `chrome-extension://${new URL(worker.url()).host}/src/popup/index.html`;
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((done) => server.close(() => done()));
});

test('the popup shows local stats and toggles the site and the master switch', async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);

  // The worker counts the blocked ad requests once the page has loaded.
  await expect
    .poll(() =>
      worker.evaluate(() =>
        chrome.storage.local.get('statsTotal').then((stored) => stored['statsTotal'] ?? 0),
      ),
    )
    .toBe(AD_SCRIPTS);

  const popup = await context.newPage();
  await popup.goto(popupUrl);
  // The popup acts on the tab that is active when it opens; refocus the page and
  // reload so it targets our test tab instead of the popup's own tab.
  await page.bringToFront();
  await popup.reload();

  // AC-3.1: blocked count for the current page and overall. The wording depends
  // on the UI language, so assert on the numbers (the exact strings are covered
  // by tests/unit/i18n.test.ts).
  await expect(popup.locator('#site-domain')).toHaveText(SITE_DOMAIN);
  await expect(popup.locator('#stats-site')).toContainText(String(AD_SCRIPTS));
  await expect(popup.locator('#stats-total')).toContainText(String(AD_SCRIPTS));

  // AC-2.1: toggling the site off whitelists its host.
  await expect(popup.locator('#site-toggle')).toHaveAttribute('aria-pressed', 'true');
  await popup.locator('#site-toggle').click();
  await expect(popup.locator('#site-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(() =>
      worker.evaluate(() =>
        chrome.storage.local.get('whitelist').then((stored) => stored['whitelist']),
      ),
    )
    .toEqual([SITE_DOMAIN]);

  // The worker turns the stored list into a dynamic rule.
  await expect
    .poll(() =>
      worker.evaluate(async () =>
        (await chrome.declarativeNetRequest.getDynamicRules()).some(
          (rule) => rule.action.type === 'allowAllRequests',
        ),
      ),
    )
    .toBe(true);

  // AC-2.1: the change applies on the next load. Retry the reload because a DNR
  // rule update propagates to the network layer asynchronously, so the first
  // load after the rule appears can still be blocked.
  await expect
    .poll(async () => {
      const failed = page.waitForEvent('requestfailed', {
        predicate: (request) => request.url().includes(BLOCKED_HOST),
      });
      await page.reload();
      return (await failed).failure()?.errorText ?? '';
    })
    .not.toContain('ERR_BLOCKED_BY_CLIENT');

  // AC-3.2: the clear button resets the counters (again, assert on the numbers).
  await popup.locator('#stats-clear').click();
  await expect(popup.locator('#stats-total')).toContainText('0');
  await expect(popup.locator('#stats-site')).toContainText('0');

  // AC-6.5: the per-page anti-fingerprinting switch adds the host to the off
  // list the worker consults before injecting.
  await expect(popup.locator('#fingerprint-site')).toBeChecked();
  await popup.locator('#fingerprint-site').uncheck();
  await expect
    .poll(() =>
      worker.evaluate(() =>
        chrome.storage.local
          .get('antiFingerprintOffSites')
          .then((stored) => stored['antiFingerprintOffSites']),
      ),
    )
    .toEqual([SITE_DOMAIN]);

  // AC-2.3: one action turns the whole extension off. Assert on the stored flag
  // rather than the localised status text.
  const readEnabled = (): Promise<unknown> =>
    worker.evaluate(() =>
      chrome.storage.local.get('enabled').then((stored) => stored['enabled'] ?? true),
    );
  await expect.poll(readEnabled).toBe(true);
  await popup.locator('#master-toggle').click();
  await expect.poll(readEnabled).toBe(false);
});
