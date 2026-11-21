/**
 * Q3 — hide the ad UI with injected CSS (T064, algorithm.md §Q3).
 *
 * Loads the *built* extension, turns the opt-in module on, and opens the mock
 * under `https://www.youtube.com` (see `youtube-fixture.ts`). The mock ships one
 * element per selector in `data/youtube-config.json`, so the test can assert the
 * injected stylesheet hides every configured ad container while leaving the
 * player ("video vẫn phát", prompt 11 rule 3) visible.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext } from '@playwright/test';

import { YOUTUBE_MOCK_URL, installYouTubeMock } from './youtube-fixture';

const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The hidden ad UI is data, not code (Q3/Q6). */
const CONFIG = JSON.parse(
  readFileSync(new URL('../../data/youtube-config.json', import.meta.url), 'utf8'),
) as { selectors: string[] };

let context!: BrowserContext;

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

  // The module is opt-in (AC-15.1); the test switches it on the way the UI will.
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await worker.evaluate(() => chrome.storage.local.set({ youtubeModule: true }));
});

test.afterAll(async () => {
  await context.close();
});

test('hides every configured ad container, keeping the player visible', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await expect(page.locator('#movie_player')).toBeVisible();

  // The stylesheet is injected on the `complete` pass; poll until it lands.
  await expect
    .poll(() =>
      page.evaluate(
        (selectors) =>
          selectors.every((selector) => {
            const element = document.querySelector(selector);
            return element !== null && getComputedStyle(element).display === 'none';
          }),
        CONFIG.selectors,
      ),
    )
    .toBe(true);

  const playerDisplay = await page
    .locator('#player-video')
    .evaluate((element) => getComputedStyle(element).display);
  expect(playerDisplay).not.toBe('none');

  await page.close();
});
