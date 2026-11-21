/**
 * Q6 — config update & kill-switch (T067, algorithm.md §Q6, US-15).
 *
 * The updater itself is unit-tested (`youtube-config-updater.test.ts`); this spec
 * covers the *integration* the download feeds: once a config is in effect
 * (`youtubeConfigActive` — the key the updater writes atomically), the built
 * extension must obey it on a real navigation. A stored `enabled:false` is the
 * remote kill-switch and must leave the page untouched, while a newer
 * `enabled:true` config re-enables the layers.
 *
 * The config is written straight to storage rather than fetched: the download,
 * schema check and atomic write are the updater's job (unit-tested), and the
 * alarm that drives it cannot be fired from Playwright. What is asserted here is
 * the observable end state a real update produces.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';

import { YOUTUBE_MOCK_URL, installYouTubeMock, readPlayerResponse } from './youtube-fixture';

const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The shipped config: the pruned fields are data, not code (Q2/Q6). */
const CONFIG = JSON.parse(
  readFileSync(new URL('../../data/youtube-config.json', import.meta.url), 'utf8'),
) as { adFields: string[] };

let context!: BrowserContext;
let worker!: Worker;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--no-proxy-server',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
  await installYouTubeMock(context);

  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // The module is opt-in (AC-15.1); the test switches it on the way the UI will.
  await worker.evaluate(() => chrome.storage.local.set({ youtubeModule: true }));
});

test.afterAll(async () => {
  await context.close();
});

/** Stores the config the updater would have applied (its atomic end state). */
function storeActiveConfig(enabled: boolean, version: number): Promise<void> {
  return worker.evaluate(
    ({ enabled, version, adFields }) =>
      chrome.storage.local.set({
        youtubeConfigActive: {
          version,
          enabled,
          layers: { network: true, prune: true, cosmetic: true, skip: true, health: true },
          adFields,
          endpoints: ['/pagead/'],
          selectors: ['.ytp-ad-module'],
          skipSelectors: ['.ytp-ad-skip-button'],
        },
      }),
    { enabled, version, adFields: CONFIG.adFields },
  );
}

/** The Q2 prune flag the MAIN-world script raises the moment it actually runs. */
function pruneRan(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as Record<string, unknown>)['__adblockYtPrune'] === true,
  );
}

test('a stored kill-switch config leaves the page untouched (Q6)', async () => {
  await storeActiveConfig(false, 9_999);

  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await expect(page.locator('#movie_player')).toBeVisible();
  await page.waitForLoadState('load');
  // A wide margin: an enabled run injects the prune on the `complete` pass, well
  // before this. If it stayed off, the module honoured the kill-switch.
  await page.waitForTimeout(1_500);

  expect(await pruneRan(page)).toBe(false);
  const response = await readPlayerResponse(page);
  for (const field of CONFIG.adFields) {
    expect(response[field], `ad field ${field}`).toBeDefined();
  }

  await page.close();
});

test('a newer enabled config re-enables the layers (Q6)', async () => {
  await storeActiveConfig(true, 10_000);

  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await expect(page.locator('#movie_player')).toBeVisible();
  await expect.poll(() => pruneRan(page)).toBe(true);

  const response = await readPlayerResponse(page);
  for (const field of CONFIG.adFields) {
    expect(response[field], `ad field ${field}`).toBeUndefined();
  }

  await page.close();
});
