/**
 * Q1 — the `youtube` network ruleset (T062, algorithm.md §Q1).
 *
 * Each rule blocks one configured ad / measurement endpoint *and* must not take
 * the video down ("video mock vẫn phát", prompt 11 rule 3). The ruleset ships
 * disabled (the YouTube module is opt-in, AC-15.1), so the test turns it on the
 * way the module will.
 *
 * The mock is served from a plain `http://127.0.0.1` origin here rather than the
 * `youtube.com` route the content-script layers use: Q1's rules match a *path*
 * on any host, and a same-origin `fetch` to an ad endpoint is observable without
 * the HSTS/route indirection (a DNR block rejects the fetch; a served 404 would
 * not).
 */

import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

import { YOUTUBE_MOCK_HTML } from './youtube-fixture';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The shipped config: Q1's endpoint list is data, not code. */
const CONFIG = JSON.parse(
  readFileSync(new URL('../../data/youtube-config.json', import.meta.url), 'utf8'),
) as { endpoints: string[] };

/** The player JSON API path Q1 must never block (algorithm.md §Q1). */
const PLAYER_PATH = '/youtubei/v1/player';

let context!: BrowserContext;
let server!: Server;
let baseUrl!: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname === '/youtube/mock') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(YOUTUBE_MOCK_HTML);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--no-proxy-server',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((done) => server.close(() => done()));
});

/** Same-origin fetch outcome: `blocked` when DNR rejected it, else `ok`. */
function fetchOutcome(page: Page, path: string): Promise<string> {
  return page.evaluate(
    (url) => fetch(url).then(() => 'ok', () => 'blocked'),
    `${baseUrl}${path}`,
  );
}

test('blocks every configured ad endpoint but never the player API', async () => {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // The module owns this ruleset: turn the module on the way a user does (its
  // switch is the single source of truth) and wait for the module to enable Q1.
  // Enabling the ruleset directly would race the module's startup reconcile,
  // which (correctly) disables it while the module is off (T068).
  await worker.evaluate(() => chrome.storage.local.set({ youtubeModule: true }));
  await expect
    .poll(() => worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()))
    .toContain('youtube');

  const page = await context.newPage();
  await page.goto(`${baseUrl}/youtube/mock`);
  await expect(page.locator('#movie_player')).toBeVisible();

  // Every configured ad / measurement endpoint is blocked...
  for (const endpoint of CONFIG.endpoints) {
    expect(await fetchOutcome(page, endpoint), `endpoint ${endpoint}`).toBe('blocked');
  }

  // ...while the player API the ad-break path extends stays reachable.
  expect(await fetchOutcome(page, PLAYER_PATH)).toBe('ok');

  // The mock player is intact — the network layer did not disturb playback.
  expect(await page.$eval('#player-video', (video) => (video as HTMLVideoElement).duration)).toBe(15);

  await page.close();
});
