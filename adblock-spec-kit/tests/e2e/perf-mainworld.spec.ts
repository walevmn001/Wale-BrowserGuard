/**
 * T090 — MAIN-world performance guard.
 *
 * The P3/P5 protections that touch the page (`anti-fingerprint.ts`,
 * `youtube/prune-main.ts`, `youtube/ad-skip.ts`) run in the page's **MAIN world**
 * via `chrome.scripting.executeScript`, which serialises the function with
 * `Function.prototype.toString()`. This spec measures what those scripts cost
 * *on the page* — install time plus one representative work pass — so a
 * regression that turns a bounded walk into an unbounded one is caught here.
 *
 * It runs on a plain page (no extension): the point is the script's own cost,
 * not the injection plumbing. Bounds are deliberately generous (a busy CI box
 * skews wall-clock), so only a real blow-up fails the test.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

import { installAntiFingerprint } from '../../src/content/anti-fingerprint';
import { installYouTubeAdSkip, YOUTUBE_AD_SKIP_OPTIONS } from '../../src/content/youtube/ad-skip';
import { installYouTubePrune, YOUTUBE_PRUNE_LIMITS } from '../../src/content/youtube/prune-main';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

interface YouTubeConfigShape {
  readonly adFields: string[];
  readonly skipSelectors: string[];
}

/** The shipped config, so the payload mirrors what the module really walks. */
function readConfig(): YouTubeConfigShape {
  return JSON.parse(readFileSync(resolve(ROOT, 'data/youtube-config.json'), 'utf8')) as
    YouTubeConfigShape;
}

/** Bounds: far above the measured figures, so only a blow-up trips them. */
const INSTALL_BUDGET_MS = 20;
const PRUNE_PASS_BUDGET_MS = 50;

let context: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', { headless: true });
});

test.afterAll(async () => {
  await context.close();
});

/**
 * Serialises one self-contained MAIN-world function into a fresh page and times
 * its install call. These functions only reference their parameters and page
 * globals, so `Function.prototype.toString()` yields runnable source.
 */
async function timeInstall(
  page: Page,
  globalName: string,
  source: string,
  args: readonly unknown[],
): Promise<number> {
  await page.addScriptTag({ content: `window.${globalName} = ${source};` });
  return page.evaluate(
    ([name, callArgs]) => {
      const install = (window as unknown as Record<string, unknown>)[name as string] as (
        ...call: unknown[]
      ) => void;
      const t0 = performance.now();
      install(...(callArgs as unknown[]));
      return performance.now() - t0;
    },
    [globalName, args] as const,
  );
}

test('Q2 prune: install and one pass stay within budget (T090)', async () => {
  const { adFields } = readConfig();
  const page = await context.newPage();
  await page.goto('about:blank');

  const installMs = await timeInstall(page, '__wgPrune', installYouTubePrune.toString(), [
    adFields,
    YOUTUBE_PRUNE_LIMITS,
  ]);

  // A representative player response: content fields plus the ad keys at every
  // level, several levels deep — the shape Q2 walks on a real page.
  const payload = await page.evaluate((fields: string[]) => {
    const make = (depth: number): Record<string, unknown> => {
      const node: Record<string, unknown> = { videoId: 'demo', title: 't', lengthSeconds: 600 };
      for (const field of fields) {
        node[field] = { marker: true, nested: { deeper: field, list: [1, 2, 3] } };
      }
      if (depth > 0) {
        node['contents'] = [make(depth - 1), make(depth - 1)];
      }
      return node;
    };
    return make(6);
  }, adFields);

  // Assigning the response is what triggers the prune (the setter is hooked).
  const pruneMs = await page.evaluate((value: Record<string, unknown>) => {
    const scope = window as unknown as Record<string, unknown>;
    const t0 = performance.now();
    scope['ytInitialPlayerResponse'] = value;
    return performance.now() - t0;
  }, payload);

  console.log(`[perf] Q2 prune install ${installMs.toFixed(2)}ms, pass ${pruneMs.toFixed(2)}ms`);
  expect(installMs).toBeLessThan(INSTALL_BUDGET_MS);
  expect(pruneMs).toBeLessThan(PRUNE_PASS_BUDGET_MS);
  await page.close();
});

test('Q4 ad-skip: install stays within budget (T090)', async () => {
  const { skipSelectors } = readConfig();
  const page = await context.newPage();
  await page.goto('about:blank');

  const installMs = await timeInstall(page, '__wgAdSkip', installYouTubeAdSkip.toString(), [
    skipSelectors,
    YOUTUBE_AD_SKIP_OPTIONS,
  ]);

  console.log(`[perf] Q4 ad-skip install ${installMs.toFixed(2)}ms`);
  expect(installMs).toBeLessThan(INSTALL_BUDGET_MS);
  await page.close();
});

test('anti-fingerprint: install stays within budget (T090)', async () => {
  const page = await context.newPage();
  await page.goto('about:blank');

  const installMs = await timeInstall(page, '__wgAntiFp', installAntiFingerprint.toString(), []);

  console.log(`[perf] anti-fingerprint install ${installMs.toFixed(2)}ms`);
  expect(installMs).toBeLessThan(INSTALL_BUDGET_MS);
  await page.close();
});
