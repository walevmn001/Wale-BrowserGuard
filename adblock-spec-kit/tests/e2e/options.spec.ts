import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
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

test('the options page toggles list groups and shows the version', async () => {
  const options = await context.newPage();
  await options.goto(optionsUrl);

  // One checkbox per declared ruleset group, all on by default.
  await expect(options.locator('#group-list input[type="checkbox"]')).toHaveCount(3);
  await expect(options.locator('[data-group="ads"]')).toBeChecked();
  await expect(options.locator('[data-group="trackers"]')).toBeChecked();
  await expect(options.locator('[data-group="malware"]')).toBeChecked();

  // "Version" section: the packaged extension version plus the data summary.
  const version = await worker.evaluate(() => chrome.runtime.getManifest().version);
  await expect(options.locator('#version-ext')).toContainText(version);
  await expect(options.locator('#version-data')).toContainText('0');

  // Switching a group off persists the choice and disables just that ruleset.
  await options.locator('[data-group="trackers"]').uncheck();
  await expect
    .poll(() =>
      worker.evaluate(() =>
        chrome.storage.local.get('disabledRuleSets').then((stored) => stored['disabledRuleSets']),
      ),
    )
    .toEqual(['trackers']);
  await expect
    .poll(() => worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()))
    .toEqual(['ads', 'malware']);

  // Switching it back on re-enables the ruleset.
  await options.locator('[data-group="trackers"]').check();
  await expect
    .poll(() => worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets()))
    .toEqual(expect.arrayContaining(['ads', 'trackers', 'malware']));
});

test('the manual update button runs and reports a result', async () => {
  test.setTimeout(40_000);
  const options = await context.newPage();
  await options.goto(optionsUrl);

  const button = options.locator('#update-now');
  await expect(button).toBeEnabled();
  await button.click();

  // The update finishes (success or a kept-previous-set failure) and re-enables
  // the button; either way the status text is no longer the "updating" hint.
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await expect(options.locator('#update-status')).not.toHaveText('Updating…');
});
