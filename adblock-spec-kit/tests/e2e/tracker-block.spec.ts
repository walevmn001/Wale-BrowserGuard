import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/**
 * A sample of the Social / ad-pixel / error-tracking entries that B2 and B2b-2
 * added to `rules/source/trackers.txt` and `rules/source/ads.txt`.
 * Self-authored for this project (MIT) — none of these hostnames were copied
 * from a third-party list.
 *
 * `prefix` keeps the path-anchored Facebook rule (`||facebook.com/tr^`) honest:
 * only requests under `/tr/` are meant to be blocked there, not all of
 * facebook.com.
 */
interface TrackerTarget {
  readonly host: string;
  readonly prefix: string;
}

const TRACKER_TARGETS: readonly TrackerTarget[] = [
  { host: 'connect.facebook.net', prefix: '/' },
  { host: 'facebook.com', prefix: '/tr/' },
  { host: 'analytics.tiktok.com', prefix: '/' },
  { host: 'business-api.tiktok.com', prefix: '/' },
  { host: 'ct.pinterest.com', prefix: '/' },
  { host: 'log.pinterest.com', prefix: '/' },
  { host: 'analytics.twitter.com', prefix: '/' },
  { host: 'ads-twitter.com', prefix: '/' },
  { host: 'alb.reddit.com', prefix: '/' },
  { host: 'events.reddit.com', prefix: '/' },
  { host: 'sentry.io', prefix: '/' },
  { host: 'sentry-cdn.com', prefix: '/' },
  { host: 'luckyorange.com', prefix: '/' },
  { host: 'luckyorange.net', prefix: '/' },
  { host: 'analytics.yahoo.com', prefix: '/' },
  { host: 'geo.yahoo.com', prefix: '/' },
  { host: 'trc.taboola.com', prefix: '/' },
  { host: 'cdn.taboola.com', prefix: '/' },
  { host: 'taboola.com', prefix: '/' },
  { host: 'outbrain.com', prefix: '/' },
  // B2b-2: vendor-specific ad-server / Social / measurement endpoints that the
  // generic `<prefix>.` rules cannot reach.
  { host: 'an.yandex.ru', prefix: '/' },
  { host: 'adfox.yandex.ru', prefix: '/' },
  { host: 'adfstat.yandex.ru', prefix: '/' },
  { host: 'bat.bing.com', prefix: '/' },
  { host: 'gemini.yahoo.com', prefix: '/' },
  { host: 'mc.yandex.ru', prefix: '/' },
  { host: 'an.facebook.com', prefix: '/' },
  { host: 'udc.yahoo.com', prefix: '/' },
  { host: 'pixel.reddit.com', prefix: '/' },
  { host: 'tr.snapchat.com', prefix: '/' },
  { host: 'px.ads.linkedin.com', prefix: '/' },
];

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>tracker e2e</title>
    <script src="/app.js"></script>
  </head>
  <body>
    ok
  </body>
</html>`;

/** One failed request to a sample host, tagged with how it was requested. */
interface Failure {
  readonly type: string;
  readonly errorText: string;
}

let context!: BrowserContext;
let server!: Server;
let baseUrl!: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    if (path === '/app.js') {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end('window.__appLoaded = true;');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(PAGE_HTML);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/`;

  context = await chromium.launchPersistentContext('', {
    headless: false,
    // `--no-proxy-server` stops Chromium from honouring the sandbox's HTTP(S)_PROXY.
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

function appLoaded(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __appLoaded?: boolean }).__appLoaded ?? false);
}

test('blocks every tracker host for both fetch() and image requests', async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);

  const failures = new Map<string, Failure[]>();
  const wanted = new Set(TRACKER_TARGETS.map((target) => target.host));
  page.on('requestfailed', (request) => {
    const { hostname } = new URL(request.url());
    if (!wanted.has(hostname)) return;
    const list = failures.get(hostname) ?? [];
    list.push({ type: request.resourceType(), errorText: request.failure()?.errorText ?? '' });
    failures.set(hostname, list);
  });

  await page.evaluate((targets) => {
    for (const { host, prefix } of targets) {
      void fetch(`http://${host}${prefix}beacon`).catch(() => undefined);
      const image = new Image();
      image.src = `http://${host}${prefix}pixel.png`;
    }
  }, TRACKER_TARGETS);

  await expect
    .poll(() => [...failures.values()].reduce((total, list) => total + list.length, 0), {
      timeout: 5000,
    })
    .toBe(TRACKER_TARGETS.length * 2);

  for (const { host } of TRACKER_TARGETS) {
    const list = failures.get(host) ?? [];
    // A bare `||domain^` rule sets no resourceTypes, so it must block the
    // fetch/xhr and the image sub-resource alike.
    expect(list.map((entry) => entry.type).sort(), `${host} blocked resource types`).toEqual([
      'fetch',
      'image',
    ]);
    expect(
      list.every((entry) => entry.errorText.includes('ERR_BLOCKED_BY_CLIENT')),
      `${host} blocked by DNR`,
    ).toBe(true);
  }

  // The same-origin script still runs, so the page is not broken.
  await expect.poll(() => appLoaded(page)).toBe(true);
});
