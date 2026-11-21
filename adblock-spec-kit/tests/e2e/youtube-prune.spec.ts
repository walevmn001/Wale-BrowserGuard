/**
 * Q2 — prune the ad fields out of the player response (T063, algorithm.md §Q2).
 *
 * Loads the *built* extension, turns the opt-in module on, and opens the mock
 * under `https://www.youtube.com` (see `youtube-fixture.ts`). The mock assigns
 * `window.ytInitialPlayerResponse` the way the real page does, so the test can
 * assert the injected MAIN-world script stripped only the configured ad fields
 * and left the content the video needs alone ("video vẫn phát", prompt 11 rule 3).
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

import { YOUTUBE_MOCK_URL, installYouTubeMock, readPlayerResponse } from './youtube-fixture';

const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The shipped config: the pruned fields are data, not code (Q2/Q6). */
const CONFIG = JSON.parse(
  readFileSync(new URL('../../data/youtube-config.json', import.meta.url), 'utf8'),
) as { adFields: string[] };

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

/** Polls until every ad field is gone from the page's player response. */
async function adFieldsPruned(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const response = await readPlayerResponse(page);
      return CONFIG.adFields.every((field) => response[field] === undefined);
    })
    .toBe(true);
}

test('strips the ad fields the mock page assigns, keeping the content', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await expect(page.locator('#movie_player')).toBeVisible();
  await adFieldsPruned(page);

  const response = await readPlayerResponse(page);
  for (const field of CONFIG.adFields) {
    expect(response[field], `ad field ${field}`).toBeUndefined();
  }
  const details = response['videoDetails'] as { videoId: string };
  expect(details.videoId).toBe('mock-video');
  expect(response['streamingData']).toBeDefined();

  await page.close();
});

test('prunes a player response the page assigns after load', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await adFieldsPruned(page);

  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>)['ytInitialPlayerResponse'] = {
      adPlacements: [{ ad: true }],
      keep: 'content',
    };
  });

  const response = await readPlayerResponse(page);
  expect(response['adPlacements']).toBeUndefined();
  expect(response['keep']).toBe('content');

  await page.close();
});
