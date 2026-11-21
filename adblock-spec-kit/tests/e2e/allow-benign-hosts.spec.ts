import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/**
 * B2b-1 guard for the generic `||<prefix>.` rules.
 *
 * The prefix rules block `<prefix>.<anything>` across vendors, so the main risk
 * is over-blocking legitimate third-party infrastructure. This list is a sample
 * of widely used hosting / auth / CDN / media hosts that a real page depends on
 * (>= 30 entries); none of them may be blocked. Self-authored for this project
 * (MIT) — see rules/README.md.
 */
export const BENIGN_HOSTS: readonly string[] = [
  'api.github.com',
  'raw.githubusercontent.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'fonts.gstatic.com',
  'fonts.googleapis.com',
  'storage.googleapis.com',
  'accounts.google.com',
  'maps.google.com',
  'mail.google.com',
  'drive.google.com',
  'login.microsoftonline.com',
  'graph.microsoft.com',
  'outlook.office.com',
  'api.stripe.com',
  'js.stripe.com',
  'checkout.shopify.com',
  'cdn.shopify.com',
  's3.amazonaws.com',
  'ec2.amazonaws.com',
  'd1.cloudfront.net',
  'upload.wikimedia.org',
  'en.wikipedia.org',
  'www.wikipedia.org',
  'docs.python.org',
  'pypi.org',
  'files.pythonhosted.org',
  'registry.npmjs.org',
  'api.npmjs.org',
  'assets.example.com',
  'img.example.com',
  'media.example.com',
  'search.example.com',
  'status.example.com',
  'blog.example.com',
];

/** One host per added prefix, to prove each rule is actually live. */
const PREFIXED_HOSTS: readonly string[] = [
  'ads.probe.test',
  'ad.probe.test',
  'adserver.probe.test',
  'adx.probe.test',
  'analytics.probe.test',
  'metrics.probe.test',
  'telemetry.probe.test',
  'tracking.probe.test',
  'tracker.probe.test',
  'pixel.probe.test',
  'trk.probe.test',
  'events.probe.test',
  'stats.probe.test',
  'beacon.probe.test',
];

const ALL_HOSTS: readonly string[] = [...BENIGN_HOSTS, ...PREFIXED_HOSTS];

let context!: BrowserContext;
let server!: Server;
let baseUrl!: string;

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    response.end('ok');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/`;

  // Resolve every probed host to the local server so a request that is *not*
  // blocked really leaves the browser.
  const resolverRules = ALL_HOSTS.map((host) => `MAP ${host} 127.0.0.1`).join(', ');
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--no-proxy-server',
      `--host-resolver-rules=${resolverRules}`,
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((done) => server.close(() => done()));
});

/** Fires a cross-host image request per host (images ignore CORS). */
function probeHosts(page: Page, hosts: readonly string[]): Promise<void> {
  return page.evaluate((targets) => {
    const { port } = new URL(window.location.href);
    for (const host of targets) {
      const image = new Image();
      image.src = `http://${host}:${port}/probe.png`;
    }
  }, hosts);
}

interface ProbeOutcome {
  /** Hosts that produced any signal (a response or a failure), i.e. were probed. */
  readonly settled: Set<string>;
  /** Hosts DNR blocked (`ERR_BLOCKED_BY_CLIENT`). */
  readonly blocked: Set<string>;
}

/**
 * Records, per probed host, whether it was probed and whether DNR blocked it.
 *
 * The `privacy` ruleset upgrades every `http` sub-resource to `https`, which
 * this offline HTTP-only server cannot answer — so an *allowed* probe emits a
 * 307 for the `http` URL and then fails TLS. An exposed probe would be stopped
 * earlier, with `ERR_BLOCKED_BY_CLIENT` and no response at all. Reading the
 * error text (rather than the status) is what isolates the block rule we care
 * about from the upgrade rule that always applies.
 */
function trackProbes(page: Page, hosts: readonly string[]): ProbeOutcome {
  const settled = new Set<string>();
  const blocked = new Set<string>();
  const hostOf = (url: string): string => new URL(url).hostname;
  page.on('response', (response) => {
    const host = hostOf(response.url());
    if (hosts.includes(host)) settled.add(host);
  });
  page.on('requestfailed', (request) => {
    const host = hostOf(request.url());
    if (hosts.includes(host)) {
      settled.add(host);
      if ((request.failure()?.errorText ?? '').includes('ERR_BLOCKED_BY_CLIENT')) blocked.add(host);
    }
  });
  return { settled, blocked };
}

test('never blocks legitimate third-party hosts (B2b-1 guard)', async () => {
  const page = await context.newPage();
  const { settled, blocked } = trackProbes(page, BENIGN_HOSTS);

  await page.goto(baseUrl);
  await probeHosts(page, BENIGN_HOSTS);

  // Every benign host must have been probed, and none may be blocked.
  await expect.poll(() => settled.size, { timeout: 15_000 }).toBe(BENIGN_HOSTS.length);
  expect([...blocked]).toEqual([]);

  await page.close();
});

test('blocks each ad / measurement subdomain prefix', async () => {
  const page = await context.newPage();
  const { blocked } = trackProbes(page, PREFIXED_HOSTS);

  await page.goto(baseUrl);
  await probeHosts(page, PREFIXED_HOSTS);

  await expect.poll(() => blocked.size, { timeout: 15_000 }).toBe(PREFIXED_HOSTS.length);
  expect([...blocked].sort()).toEqual([...PREFIXED_HOSTS].sort());

  await page.close();
});
