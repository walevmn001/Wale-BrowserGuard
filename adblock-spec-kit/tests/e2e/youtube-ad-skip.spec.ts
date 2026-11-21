/**
 * Q4 — skip / fast-forward an ad that still plays (T065, algorithm.md §Q4).
 *
 * Loads the *built* extension, turns the opt-in module on, and opens the mock
 * under `https://www.youtube.com` (see `youtube-fixture.ts`). Q3's stylesheet
 * hides `.ytp-ad-module` (the container the mock's skip button lives in), so on
 * the integrated page the click path is unreachable and Q4 exercises its
 * fallback: mute + fast-forward + seek, then restore once the ad ends. The tests
 * prove the restore (mute/rate/position) and that the layer stops after its
 * attempt cap instead of looping forever.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

import { YOUTUBE_AD_SKIP_OPTIONS } from '../../src/content/youtube/ad-skip';
import {
  YOUTUBE_MOCK_URL,
  enterAd,
  exitAd,
  installYouTubeMock,
  readMockState,
} from './youtube-fixture';

const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Reads a numeric `<video>` property the ad-skip layer mutates. */
function readVideoNumber(
  page: Page,
  property: 'playbackRate' | 'currentTime',
): Promise<number> {
  return page.$eval('#player-video', (video, key) => (video as HTMLVideoElement)[key], property);
}

/** Reads the `<video>` mute flag the ad-skip layer toggles. */
function readVideoMuted(page: Page): Promise<boolean> {
  return page.$eval('#player-video', (video) => (video as HTMLVideoElement).muted);
}

/** Waits until the Q4 observer reports itself installed in the page's MAIN world. */
async function waitForAdSkip(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as Record<string, unknown>)['__adblockYtAdSkip'] === true,
      ),
    )
    .toBe(true);
}

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

test('mutes, fast-forwards and restores the player once the ad ends', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await expect(page.locator('#movie_player')).toBeVisible();
  await waitForAdSkip(page);

  // Start from a known user state: unmuted, normal speed, at the beginning.
  await page.$eval('#player-video', (video) => {
    const element = video as HTMLVideoElement;
    element.muted = false;
    element.playbackRate = 1;
    element.currentTime = 0;
  });

  await enterAd(page);

  await expect.poll(() => readVideoMuted(page)).toBe(true);
  await expect
    .poll(() => readVideoNumber(page, 'playbackRate'))
    .toBe(YOUTUBE_AD_SKIP_OPTIONS.skipRate);

  // Q3 hides the skip button, so the fallback (not a click) drives the state.
  expect((await readMockState(page)).skipClicks).toBe(0);
  await expect
    .poll(() => readVideoNumber(page, 'currentTime'))
    .toBeCloseTo(15 - YOUTUBE_AD_SKIP_OPTIONS.epsilon, 5);

  await exitAd(page);

  await expect.poll(() => readVideoMuted(page)).toBe(false);
  await expect.poll(() => readVideoNumber(page, 'playbackRate')).toBe(1);
  await expect.poll(() => readVideoNumber(page, 'currentTime')).toBe(0);

  await page.close();
});

test('stops seeking after the attempt cap instead of looping forever', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await waitForAdSkip(page);

  const before = await readMockState(page);
  await enterAd(page, { skippable: false });

  // Force many observation passes: each class change wakes the throttled observer.
  const pokes = YOUTUBE_AD_SKIP_OPTIONS.maxAttempts + 3;
  for (let index = 0; index < pokes; index += 1) {
    await page.evaluate((n) => document.body.classList.toggle(`poke-${n}`), index % 2);
    await page.waitForTimeout(YOUTUBE_AD_SKIP_OPTIONS.throttleMs + 50);
  }

  const seeks = (await readMockState(page)).seekWrites - before.seekWrites;
  expect(seeks).toBeGreaterThan(0);
  expect(seeks).toBeLessThanOrEqual(YOUTUBE_AD_SKIP_OPTIONS.maxAttempts);

  await page.close();
});
