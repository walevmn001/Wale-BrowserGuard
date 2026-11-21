/**
 * Q5 — watch the player for playback faults and degrade the module (T066,
 * algorithm.md §Q5, US-15.4).
 *
 * Loads the *built* extension, turns the opt-in module on, and opens the mock
 * under `https://www.youtube.com` (see `youtube-fixture.ts`). The monitor is
 * injected into the content-script world, so the test drives it through real
 * page events: a media `error` on the `<video>` is exactly what the monitor
 * forwards to the worker. The tests assert the *session* flags the worker
 * stores (`chrome.storage.session`) and that a degraded session actually skips
 * the Q2 prune on the next navigation.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';

import {
  YOUTUBE_MOCK_URL,
  installYouTubeMock,
  readPlayerResponse,
} from './youtube-fixture';

const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The session flags the worker derives from the page's fault reports. */
interface HealthSessionState {
  readonly q2Disabled: boolean;
  readonly moduleDisabled: boolean;
  readonly faults: number[];
}

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

/** Reads the Q5 session flags straight out of the worker's session storage. */
function readHealthSession(): Promise<HealthSessionState | undefined> {
  return worker.evaluate(async () => {
    const items = (await chrome.storage.session.get('youtubeHealthSession')) as Record<
      string,
      HealthSessionState | undefined
    >;
    return items['youtubeHealthSession'];
  });
}

/** Raises the same media `error` the monitor listens for on the `<video>`. */
function dispatchMediaError(page: Page): Promise<void> {
  return page.$eval('#player-video', (video) => {
    video.dispatchEvent(new Event('error'));
  });
}

/** Waits until the Q4 observer is live (the monitor is injected in the same pass). */
async function waitForAdSkip(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as Record<string, unknown>)['__adblockYtAdSkip'] === true,
      ),
    )
    .toBe(true);
}

/**
 * The monitor is injected asynchronously after the page settles, so the test
 * keeps poking until the worker records a fault (proof the monitor is live),
 * then clears the session to start the real scenario from a clean slate.
 */
async function waitForMonitorAndClean(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        await dispatchMediaError(page);
        return (await readHealthSession())?.faults.length ?? 0;
      },
      { timeout: 20_000, intervals: [300] },
    )
    .toBeGreaterThanOrEqual(1);

  await worker.evaluate(() => chrome.storage.session.remove('youtubeHealthSession'));
}

test('drops the Q2 prune for the session after two playback faults', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await expect(page.locator('#movie_player')).toBeVisible();
  await waitForMonitorAndClean(page);

  // First fault: counted, nothing degraded yet.
  await dispatchMediaError(page);
  await expect.poll(async () => (await readHealthSession())?.faults.length ?? 0).toBe(1);
  expect((await readHealthSession())?.q2Disabled).toBe(false);

  // Second fault in the window drops the Q2 prune (N = 2).
  await dispatchMediaError(page);
  await expect.poll(async () => (await readHealthSession())?.q2Disabled ?? false).toBe(true);

  // A fresh navigation must now skip Q2: its ad field survives on the response.
  await page.reload();
  await waitForAdSkip(page);
  expect('adPlacements' in (await readPlayerResponse(page))).toBe(true);

  await page.close();
});

test('turns the whole module off for the session after a third fault', async () => {
  const page = await context.newPage();
  await page.goto(YOUTUBE_MOCK_URL);
  await expect(page.locator('#movie_player')).toBeVisible();
  await waitForMonitorAndClean(page);

  await dispatchMediaError(page);
  await expect.poll(async () => (await readHealthSession())?.faults.length ?? 0).toBe(1);
  await dispatchMediaError(page);
  await expect.poll(async () => (await readHealthSession())?.q2Disabled ?? false).toBe(true);

  // A fault once Q2 is already dropped turns the whole module off for the session.
  await dispatchMediaError(page);
  await expect.poll(async () => (await readHealthSession())?.moduleDisabled ?? false).toBe(true);

  await page.close();
});
