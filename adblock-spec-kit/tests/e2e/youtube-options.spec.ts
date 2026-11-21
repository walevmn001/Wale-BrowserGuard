/**
 * T068 — the YouTube module switch and the AC-15.6 risk warning (US-15).
 *
 * The module is opt-in and off by default (AC-15.1). The options page exposes
 * its switch and the required caveats (best-effort, possible ToS violation, may
 * stop working). Driving the real switch must set `youtubeModule` *and* turn the
 * module-owned `youtube` ruleset (Q1) on/off in the built extension, since the
 * master switch never touches that ruleset.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';

const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

let context!: BrowserContext;
let worker!: Worker;
let optionsUrl!: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  optionsUrl = `chrome-extension://${new URL(worker.url()).host}/src/options/index.html`;
});

test.afterAll(async () => {
  await context.close();
});

test('the switch is off by default and shows the risk warning (AC-15.1, AC-15.6)', async () => {
  const options = await context.newPage();
  await options.goto(optionsUrl);
  await options.locator('a[data-nav="youtube"]').click();

  // AC-15.6: the three caveats are shown before the user opts in.
  const warning = options.locator('#youtube .banner.warn');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('YouTube');
  // The inner wrapper holds the heading plus the three required caveats.
  await expect(warning.locator('> div > div')).toHaveCount(4);

  // Opt-in: the module starts off and its ruleset is not enabled.
  await expect(options.locator('#yt-module')).not.toBeChecked();
  await expect
    .poll(() => worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()))
    .not.toContain('youtube');

  await options.close();
});

test('toggling the switch sets the flag and enables the module ruleset (Q1)', async () => {
  const options = await context.newPage();
  await options.goto(optionsUrl);
  await options.locator('a[data-nav="youtube"]').click();

  await options.locator('#yt-module').check();
  await expect
    .poll(() => worker.evaluate(() => chrome.storage.local.get('youtubeModule')))
    .toEqual({ youtubeModule: true });
  await expect
    .poll(() => worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()))
    .toContain('youtube');

  // Switching it off disables the ruleset again — the module owns Q1 only.
  await options.locator('#yt-module').uncheck();
  await expect
    .poll(() => worker.evaluate(() => chrome.storage.local.get('youtubeModule')))
    .toEqual({ youtubeModule: false });
  await expect
    .poll(() => worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()))
    .not.toContain('youtube');

  await options.close();
});
