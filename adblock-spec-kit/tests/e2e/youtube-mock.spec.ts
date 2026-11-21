import { readFileSync } from 'node:fs';

import { chromium, expect, test, type BrowserContext } from '@playwright/test';

import {
  YOUTUBE_MOCK_URL,
  enterAd,
  exitAd,
  installYouTubeMock,
  readMockState,
  readPlayerResponse,
} from './youtube-fixture';

// The shipped config; the mock must carry every `adField` it strips (Q2).
const CONFIG_PATH = new URL('../../data/youtube-config.json', import.meta.url);

let context!: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    // `--no-proxy-server` keeps Chromium from honouring the sandbox's
    // HTTP(S)_PROXY env; the mock is served locally via `context.route`.
    args: ['--no-proxy-server'],
  });
  await installYouTubeMock(context);
});

test.afterAll(async () => {
  await context.close();
});

test('serves the mock under youtube.com with a fake player response', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await expect(page.locator('#movie_player')).toBeVisible();

  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as { adFields: string[] };
  const response = await readPlayerResponse(page);

  // Every ad field Q2 strips is present, and is an array like the real one.
  for (const field of config.adFields) {
    expect(Array.isArray(response[field]), field).toBe(true);
  }

  // Content fields the prune must leave untouched are present too.
  const details = response['videoDetails'] as { videoId: string };
  expect(details.videoId).toBe('mock-video');
  expect(response['streamingData']).toBeDefined();

  await page.close();
});

test('toggles .ad-showing and the skip button', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);

  await expect(page.locator('#movie_player.ad-showing')).toHaveCount(0);

  await enterAd(page);
  await expect(page.locator('#movie_player.ad-showing')).toHaveCount(1);
  await expect(page.locator('.ytp-ad-skip-button-modern')).toBeVisible();
  expect((await readMockState(page)).adPlaying).toBe(true);

  // Clicking skip ends the ad and is observable to tests.
  await page.locator('.ytp-ad-skip-button-modern').click();
  expect((await readMockState(page)).skipClicks).toBe(1);
  await expect(page.locator('#movie_player.ad-showing')).toHaveCount(0);

  // A non-skippable ad hides the skip button (Q4 falls back to mute + seek).
  await enterAd(page, { skippable: false });
  await expect(page.locator('.ytp-ad-skip-button-modern')).toBeHidden();
  await exitAd(page);

  await page.close();
});

test('exposes a finite-duration video the ad-skip layer can seek', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);

  const duration = await page.$eval(
    '#player-video',
    (video) => (video as HTMLVideoElement).duration,
  );
  expect(duration).toBe(15);

  await page.$eval('#player-video', (video) => {
    (video as HTMLVideoElement).currentTime = 14.9;
  });
  const currentTime = await page.$eval(
    '#player-video',
    (video) => (video as HTMLVideoElement).currentTime,
  );
  expect(currentTime).toBeCloseTo(14.9, 5);

  await page.close();
});
