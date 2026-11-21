/**
 * Mock YouTube page for the YouTube module e2e tests (T061).
 *
 * The module only ever runs on YouTube, so the mock is served *as*
 * `https://www.youtube.com` by intercepting the navigation with Playwright's
 * `context.route(...)` and fulfilling it locally. That keeps a real page origin
 * (so the module's `youtube.com`-scoped content scripts inject) without a
 * certificate or a live network: `youtube.com` is HSTS-preloaded, so a plain
 * local HTTP server cannot be reached under that name.
 *
 * The page carries the three things the module's layers need to be testable
 * offline:
 *
 *  - Q2 (prune) reads `window.ytInitialPlayerResponse`, so the page assigns a
 *    fake response whose keys include every `adFields` entry in
 *    `data/youtube-config.json` (plus content fields the prune must not touch).
 *  - Q3 (cosmetic CSS) hides the ad containers, so the page includes one element
 *    per selector in the config.
 *  - Q4 (ad-skip) watches the player for `.ad-showing` and clicks the skip
 *    button, so the player toggles that class and ships a skip button.
 *
 * A tiny control API (`window.__ytMock`) lets tests drive the ad/playback state
 * deterministically, with no real media file and no real YouTube visit.
 */

import type { BrowserContext, Page } from '@playwright/test';

/** Host the mock is served under. */
export const YOUTUBE_HOST = 'www.youtube.com';

/** Path the mock page is served at. */
const MOCK_PATH = '/youtube/mock';

/** The URL to open: the mock served as the YouTube host. */
export const YOUTUBE_MOCK_URL = `https://${YOUTUBE_HOST}${MOCK_PATH}`;

/**
 * The mock page. `window.ytInitialPlayerResponse` mirrors a real player response
 * shape: ad keys (stripped by Q2) alongside the content keys that must survive.
 * Exported so the Q1 network spec (T062) can serve the *same* page from a plain
 * local origin, where a same-origin `fetch` to an ad endpoint is observable
 * without the `youtube.com` HSTS/route machinery.
 */
export const YOUTUBE_MOCK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>YouTube mock (T061)</title>
  </head>
  <body>
    <div id="masthead-ad">masthead ad</div>

    <div id="movie_player" class="html5-video-player">
      <video id="player-video" muted></video>
      <div class="ytp-ad-module">
        <div class="ytp-ad-overlay-container">
          <div class="ytp-ad-text-overlay">Sponsored</div>
        </div>
        <button class="ytp-ad-skip-button-modern ytp-skip-ad-button" hidden>Skip Ad</button>
      </div>
    </div>

    <ytd-ad-slot-renderer>in-feed ad</ytd-ad-slot-renderer>
    <ytd-display-ad-renderer>display ad</ytd-display-ad-renderer>
    <ytd-promoted-sparkles-web-renderer>sparkles ad</ytd-promoted-sparkles-web-renderer>
    <ytd-promoted-video-renderer>promoted video</ytd-promoted-video-renderer>
    <ytd-in-feed-ad-layout-renderer>in-feed layout ad</ytd-in-feed-ad-layout-renderer>
    <ytd-banner-promo-renderer>banner promo</ytd-banner-promo-renderer>
    <ytd-statement-banner-renderer>statement banner</ytd-statement-banner-renderer>

    <script>
      window.ytInitialPlayerResponse = {
        videoDetails: {
          videoId: 'mock-video',
          title: 'Mock video',
          lengthSeconds: '60',
          author: 'Mock channel',
        },
        streamingData: {
          formats: [
            { itag: 18, url: 'https://r1---sn-mock.googlevideo.com/videoplayback?id=mock' },
          ],
        },
        adPlacements: [{ adPlacementRenderer: { renderer: { adSlotRenderer: {} } } }],
        playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
        adSlots: [{ adSlotRenderer: { adSlotMetadata: { slotId: 'mock-ad' } } }],
      };

      (function () {
        var player = document.getElementById('movie_player');
        var video = document.getElementById('player-video');
        var skip = document.querySelector('.ytp-ad-skip-button-modern');
        var state = { adPlaying: false, skipClicks: 0, seekWrites: 0 };
        var currentTime = 0;

        // A finite duration and a writable currentTime let the ad-skip layer
        // (Q4) seek to the end without a real media file being loaded. Every
        // write is counted so a test can prove the layer stops after its
        // attempt cap (no infinite seek loop).
        Object.defineProperty(video, 'duration', {
          configurable: true,
          get: function () {
            return 15;
          },
        });
        Object.defineProperty(video, 'currentTime', {
          configurable: true,
          get: function () {
            return currentTime;
          },
          set: function (value) {
            currentTime = value;
            state.seekWrites += 1;
          },
        });

        function exitAd() {
          state.adPlaying = false;
          player.classList.remove('ad-showing');
          skip.hidden = true;
        }

        function enterAd(options) {
          state.adPlaying = true;
          player.classList.add('ad-showing');
          skip.hidden = options && options.skippable === false;
        }

        skip.addEventListener('click', function () {
          state.skipClicks += 1;
          exitAd();
        });

        window.__ytMock = { enterAd: enterAd, exitAd: exitAd, state: state };
      })();
    </script>
  </body>
</html>`;

/**
 * Serve the mock as `https://www.youtube.com` for the given context. Any other
 * request under that origin gets a 404 so it can never reach the real network.
 */
export async function installYouTubeMock(context: BrowserContext): Promise<void> {
  await context.route(`https://${YOUTUBE_HOST}/**`, (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === MOCK_PATH) {
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: YOUTUBE_MOCK_HTML,
      });
    }
    return route.fulfill({ status: 404, body: '' });
  });
}

/** Read the fake player response out of the page's own (MAIN) world. */
export function readPlayerResponse(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      (window as unknown as { ytInitialPlayerResponse: Record<string, unknown> })
        .ytInitialPlayerResponse,
  );
}

/** Switch the player into an ad break (skippable by default), for Q4 tests. */
export function enterAd(page: Page, options: { skippable?: boolean } = {}): Promise<void> {
  return page.evaluate((opts) => {
    const mock = window as unknown as { __ytMock: { enterAd(o: { skippable?: boolean }): void } };
    mock.__ytMock.enterAd(opts);
  }, options);
}

/** Leave the ad break, as clicking skip does. */
export function exitAd(page: Page): Promise<void> {
  return page.evaluate(() => {
    (window as unknown as { __ytMock: { exitAd(): void } }).__ytMock.exitAd();
  });
}

export interface MockState {
  readonly adPlaying: boolean;
  readonly skipClicks: number;
  /** How many times the ad-skip layer wrote `video.currentTime` (Q4 bound). */
  readonly seekWrites: number;
}

/** Read the mock's ad state (how many times the skip button was clicked). */
export function readMockState(page: Page): Promise<MockState> {
  return page.evaluate(() => {
    const { state } = (window as unknown as { __ytMock: { state: MockState } }).__ytMock;
    return { adPlaying: state.adPlaying, skipClicks: state.skipClicks, seekWrites: state.seekWrites };
  });
}
