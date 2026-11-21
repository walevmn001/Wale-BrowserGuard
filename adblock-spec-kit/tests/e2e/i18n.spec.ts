import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The popup is fixed at 380px wide (`--popup-w`); a page opened as a tab must
 *  be narrowed to that width for an overflow check to mean anything. */
const POPUP_WIDTH = 380;

let context!: BrowserContext;
let worker!: Worker;
let popupUrl!: string;
let optionsUrl!: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const origin = `chrome-extension://${new URL(worker.url()).host}`;
  popupUrl = `${origin}/src/popup/index.html`;
  optionsUrl = `${origin}/src/options/index.html`;
});

test.afterAll(async () => {
  await context.close();
});

/** Stores the language the popup/dashboard read on boot (Phase 11). */
async function setLanguage(language: 'vi' | 'en'): Promise<void> {
  await worker.evaluate((value) => chrome.storage.local.set({ language: value }), language);
}

/** True when neither axis of the document overflows its viewport by >1px. */
async function fitsViewport(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth <= root.clientWidth + 1;
  });
}

test('both locales translate every page and neither breaks the layout', async () => {
  for (const [language, heading, placeholder] of [
    ['vi', 'Trang hiện tại', 'Tìm kiếm'],
    ['en', 'Current page', 'Search'],
  ] as const) {
    await setLanguage(language);

    const popup = await context.newPage();
    await popup.setViewportSize({ width: POPUP_WIDTH, height: 1000 });
    await popup.goto(popupUrl);
    await expect(popup.locator('html')).toHaveAttribute('lang', language);
    await expect(popup.locator('#site-heading')).toHaveText(heading);
    // Long strings must wrap/truncate, not push the fixed-width panel sideways.
    expect(await fitsViewport(popup), `${language} popup overflows`).toBe(true);
    await popup.close();

    const options = await context.newPage();
    await options.setViewportSize({ width: 1280, height: 900 });
    await options.goto(optionsUrl);
    await expect(options.locator('html')).toHaveAttribute('lang', language);
    await expect(options.locator('#smart-search')).toHaveAttribute('placeholder', placeholder);
    expect(await fitsViewport(options), `${language} dashboard overflows`).toBe(true);
    await options.close();
  };
});
