/**
 * Golden suite (T018 / specs/001-adblock-security/test-golden.md).
 *
 * Internet-free and deterministic: synthetic fixture pages are served from a
 * local HTTP server and every known ad/tracker host is pinned to that server,
 * so a request that slips past the rules really loads (see `browser.ts`).
 *
 * Measures the US-1 acceptance criteria against the packaged rules and stores
 * the baseline in `tests/golden/results/<date>.json`:
 *   AC-1.1 block rate ≥ 95%   AC-1.2 break rate ≤ 2%
 *   AC-1.3 latency increase < 5ms   AC-1.4 still blocks after a restart
 *
 * Run with `npm run test:golden` (needs `npm run build` first, and `xvfb-run -a`
 * on a headless CI box).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { launchContext, readServiceWorkerHeapMb } from './browser';
import { goldenPages, pagePath, type GoldenPage } from './fixtures';
import { isBroken, measurePage, type PageMeasurement } from './measure';
import {
  BLOCK_RATE_THRESHOLD,
  BREAK_RATE_THRESHOLD,
  LATENCY_THRESHOLD_MS,
  MEMORY_THRESHOLD_MB,
  median,
  summarize,
  writeResults,
} from './results';
import { startFixtureServer, type FixtureServer } from './server';

let server: FixtureServer | undefined;
let withExtension: BrowserContext | undefined;
let withoutExtension: BrowserContext | undefined;

const measured: PageMeasurement[] = [];
const latencyWith: number[] = [];
const latencyWithout: number[] = [];
const latencyDeltas: number[] = [];
let restartPassed = false;
let memoryMb: number | null = null;

function requireSetup(): { server: FixtureServer; withExtension: BrowserContext } {
  if (server === undefined || withExtension === undefined) {
    throw new Error('golden setup did not run');
  }
  return { server, withExtension };
}

function readLoadMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    return navigation?.duration ?? 0;
  });
}

async function navigateLoadMs(page: Page, url: string): Promise<number> {
  await page.goto(url, { waitUntil: 'load' });
  return readLoadMs(page);
}

async function countBlocked(
  baseUrl: string,
  fixture: GoldenPage,
  userDataDir: string,
): Promise<number> {
  const context = await launchContext({ extension: true, userDataDir });
  try {
    const page = await context.newPage();
    const measurement = await measurePage(page, fixture, baseUrl);
    await page.close();
    return measurement.blockedRequests;
  } finally {
    await context.close();
  }
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  server = await startFixtureServer();
  withExtension = await launchContext({ extension: true });
  withoutExtension = await launchContext({ extension: false });
});

test.afterAll(async () => {
  await withExtension?.close();
  await withoutExtension?.close();
  await server?.close();
  const file = writeResults(
    summarize(
      measured,
      { withExtensionMs: latencyWith, withoutExtensionMs: latencyWithout, deltas: latencyDeltas },
      restartPassed,
      memoryMb,
    ),
  );
  console.log(`golden baseline written to ${file}`);
});

test('AC-1.1 / AC-1.2: blocks known ad requests without breaking pages', async () => {
  const { server: fixtureServer, withExtension: context } = requireSetup();
  const page = await context.newPage();
  for (const fixture of goldenPages()) {
    measured.push(await measurePage(page, fixture, fixtureServer.baseUrl));
  }
  await page.close();

  const total = measured.reduce((sum, item) => sum + item.knownRequests, 0);
  const blocked = measured.reduce((sum, item) => sum + item.blockedRequests, 0);
  expect(total).toBeGreaterThan(0);
  expect(blocked / total).toBeGreaterThanOrEqual(BLOCK_RATE_THRESHOLD);

  const broken = measured.filter(isBroken).length;
  expect(broken / measured.length).toBeLessThanOrEqual(BREAK_RATE_THRESHOLD);
});

test('AC-1.3: navigation latency stays within the budget', async () => {
  const { server: fixtureServer, withExtension: withCtx } = requireSetup();
  if (withoutExtension === undefined) {
    throw new Error('golden setup did not run');
  }
  const fixtures = goldenPages();
  const first = fixtures[0];
  if (first === undefined) {
    throw new Error('fixtures are empty');
  }
  const pageWith = await withCtx.newPage();
  const pageWithout = await withoutExtension.newPage();

  // Warm both browsers so the first sample does not skew the comparison.
  await navigateLoadMs(pageWith, `${fixtureServer.baseUrl}${pagePath(first)}`);
  await navigateLoadMs(pageWithout, `${fixtureServer.baseUrl}${pagePath(first)}`);

  // Pair each page across both browsers, alternating order, so slow drift on
  // the machine cancels out of the per-page delta instead of biasing one side.
  //
  // Each page is sampled several times per browser and the fastest sample is
  // kept. The suite runs two headed browsers at once, and on a CPU-constrained
  // box the resulting scheduling jitter (measured at ±15ms per page here, versus
  // a ~1ms two-identical-browser floor) dwarfs the overhead being measured — so a
  // single sample per page makes AC-1.3 flaky. Contention can only *add* time, so
  // taking the minimum across enough samples converges on a page's intrinsic load
  // time, while any real extension overhead still shows up in every sample.
  const SAMPLES_PER_PAGE = 5;
  for (const [index, fixture] of fixtures.entries()) {
    const url = `${fixtureServer.baseUrl}${pagePath(fixture)}`;
    const swapped = index % 2 === 1;
    let withMs = Number.POSITIVE_INFINITY;
    let withoutMs = Number.POSITIVE_INFINITY;
    for (let sample = 0; sample < SAMPLES_PER_PAGE; sample += 1) {
      const firstMs = await navigateLoadMs(swapped ? pageWith : pageWithout, url);
      const secondMs = await navigateLoadMs(swapped ? pageWithout : pageWith, url);
      withMs = Math.min(withMs, swapped ? firstMs : secondMs);
      withoutMs = Math.min(withoutMs, swapped ? secondMs : firstMs);
    }
    latencyWith.push(withMs);
    latencyWithout.push(withoutMs);
    latencyDeltas.push(withMs - withoutMs);
  }

  await pageWith.close();
  await pageWithout.close();

  expect(latencyDeltas).toHaveLength(fixtures.length);
  expect(median(latencyDeltas)).toBeLessThan(LATENCY_THRESHOLD_MS);
});

test('memory: the extension worker stays under the budget', async () => {
  const { server: fixtureServer, withExtension: context } = requireSetup();
  const fixture = goldenPages()[0];
  if (fixture === undefined) {
    throw new Error('fixtures are empty');
  }

  // Navigate once so Chromium keeps the (lazily started) extension worker alive
  // for the measurement, then read its live JS heap.
  const page = await context.newPage();
  await page.goto(`${fixtureServer.baseUrl}${pagePath(fixture)}`, { waitUntil: 'load' });
  await page.close();
  memoryMb = await readServiceWorkerHeapMb(context);

  expect(memoryMb).not.toBeNull();
  expect(memoryMb ?? Number.POSITIVE_INFINITY).toBeLessThan(MEMORY_THRESHOLD_MB);
});

test('AC-1.4: keeps blocking after a browser restart', async () => {
  const { server: fixtureServer } = requireSetup();
  const fixture = goldenPages().find((candidate) => candidate.ads.length > 0);
  if (fixture === undefined) {
    throw new Error('fixtures expose no ad hosts');
  }
  const userDataDir = mkdtempSync(join(tmpdir(), 'adblock-golden-'));
  try {
    const first = await countBlocked(fixtureServer.baseUrl, fixture, userDataDir);
    const second = await countBlocked(fixtureServer.baseUrl, fixture, userDataDir);
    restartPassed = first > 0 && second > 0;
    expect(restartPassed).toBe(true);
  } finally {
    rmSync(userDataDir, { recursive: true, force: true });
  }
});
