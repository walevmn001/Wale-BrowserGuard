import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');
const SITE_DOMAIN = 'localhost';

// Deliberately hostile page CSS: broad selectors that fight every element on the
// page with `!important`. The injected picker and banner must survive it
// (AC-UI-7) — they pin their own layout inline and live in a shadow root the
// page cannot reach.
const HOSTILE_CSS = `<style>
  * { position: static !important; z-index: 0 !important; box-sizing: content-box !important; }
  div { display: inline !important; }
</style>`;

const PICKER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>picker e2e</title>${HOSTILE_CSS}</head>
<body><div id="ad-slot" class="theme-ad">Sponsored</div></body></html>`;

// A plain-http page with a password field is exactly what the "insecure"
// banner is meant to warn about.
const INSECURE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>insecure e2e</title>${HOSTILE_CSS}</head>
<body><form><input id="pw" type="password" /></form></body></html>`;

let context!: BrowserContext;
let server!: Server;
let baseUrl!: string;
let popupUrl!: string;
let worker!: Worker;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(request.url?.startsWith('/insecure') ? INSECURE_HTML : PICKER_HTML);
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

test.beforeEach(async () => {
  await worker.evaluate(async () => {
    await chrome.storage.local.remove(['hiddenSelectors', 'bannerTrusted']);
  });
});

/** Computed style a hostile page would try to change, read off the host element. */
async function hostBox(page: Page, id: string): Promise<{ position: string; zIndex: string }> {
  return page.locator(`#${id}`).evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.position, zIndex: style.zIndex };
  });
}

test('the picker survives hostile page CSS and hides the picked element', async () => {
  const page = await context.newPage();
  await page.goto(`${baseUrl}picker`);

  // Open the popup on this tab and use its "hide an element" action.
  const popup = await context.newPage();
  await popup.goto(popupUrl);
  await page.bringToFront();
  await popup.reload();
  await expect(popup.locator('#site-domain')).toHaveText(SITE_DOMAIN);
  await popup.locator('#action-pick').click();

  // The worker injects the picker into the page's top layer.
  const picker = page.locator('#wale-guard-picker');
  await expect(picker).toHaveCount(1);

  // AC-UI-7: the page's `* { position: static; z-index: 0 !important }` loses.
  expect(await hostBox(page, 'wale-guard-picker')).toEqual({
    position: 'fixed',
    zIndex: '2147483647',
  });

  // Pick the element, then confirm from the shadow toolbar.
  await page.locator('#ad-slot').click();
  await expect(picker.locator('[data-role="label"]')).toHaveText('#ad-slot');
  await picker.locator('button[data-act="confirm"]').click();

  // The selector is persisted for the domain, and the element is gone.
  await expect
    .poll(() =>
      worker.evaluate(() =>
        chrome.storage.local.get('hiddenSelectors').then((stored) => stored['hiddenSelectors']),
      ),
    )
    .toEqual({ [SITE_DOMAIN]: ['#ad-slot'] });
  await expect(page.locator('#ad-slot')).toBeHidden();

  // The toolbar removes itself a moment after a successful save.
  await expect(picker).toHaveCount(0);
});

test('the security banner survives hostile CSS, and trusting the site records the host', async () => {
  const page = await context.newPage();
  await page.goto(`${baseUrl}insecure`);

  const banner = page.locator('#wale-guard-banner');
  await expect(banner).toHaveCount(1);

  // AC-UI-7: the hostile `div { display: inline !important }` cannot flatten it.
  expect(await hostBox(page, 'wale-guard-banner')).toEqual({
    position: 'fixed',
    zIndex: '2147483647',
  });
  await expect(banner.locator('[data-role="bar"]')).toBeVisible();

  await banner.locator('button[data-act="trust"]').click();

  await expect
    .poll(() =>
      worker.evaluate(() =>
        chrome.storage.local.get('bannerTrusted').then((stored) => stored['bannerTrusted']),
      ),
    )
    .toEqual([SITE_DOMAIN]);
  await expect(banner).toHaveCount(0);

  // Trusted means it stays away on the next load.
  await page.reload();
  await page.waitForLoadState('load');
  await page.waitForTimeout(600);
  await expect(banner).toHaveCount(0);
});
