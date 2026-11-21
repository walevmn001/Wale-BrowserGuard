import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

let context!: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
});

test.afterAll(async () => {
  await context.close();
});

async function extensionId(): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return new URL(worker.url()).host;
}

test('loads the extension service worker and popup', async () => {
  const id = await extensionId();
  expect(id).toMatch(/^[a-p]{32}$/);

  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/src/popup/index.html`);

  await expect(page.locator('h1')).toHaveText('AdBlock Security');
});

test('serves the rasterised toolbar icon as PNG (T070)', async () => {
  const id = await extensionId();

  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${id}/src/popup/index.html`);

    const icon = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const blob = await response.blob();
      return { ok: response.ok, type: blob.type, size: blob.size };
    }, `chrome-extension://${id}/icons/icon-128.png`);

    expect(icon.ok).toBe(true);
    expect(icon.type).toContain('png');
    expect(icon.size).toBeGreaterThan(0);
  } finally {
    await page.close();
  }
});
