import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

let context!: BrowserContext;
let worker!: Worker;
let optionsUrl!: string;

/** Reads the effective WebRTC IP handling policy from the worker. */
function readPolicy(worker: Worker): Promise<{ value: string; levelOfControl: string }> {
  return worker.evaluate(() =>
    chrome.privacy.network.webRTCIPHandlingPolicy.get({}).then((details) => ({
      value: details.value,
      levelOfControl: details.levelOfControl,
    })),
  );
}

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

test('WebRTC protection is opt-in: it is off by default (AC-6.4)', async () => {
  const options = await context.newPage();
  await options.goto(optionsUrl);

  await expect(options.locator('#webrtc-protection')).not.toBeChecked();
  await expect.poll(() => readPolicy(worker)).toEqual({
    value: 'default',
    levelOfControl: 'controllable_by_this_extension',
  });
});

test('ticking the box restricts WebRTC and unticking restores the default (AC-6.4)', async () => {
  const options = await context.newPage();
  await options.goto(optionsUrl);

  await options.locator('#webrtc-protection').check();

  await expect.poll(() => readPolicy(worker)).toEqual({
    value: 'default_public_interface_only',
    levelOfControl: 'controlled_by_this_extension',
  });
  await expect
    .poll(() => worker.evaluate(() => chrome.storage.local.get('webrtcProtection')))
    .toEqual({ webrtcProtection: true });

  await options.locator('#webrtc-protection').uncheck();

  await expect.poll(() => readPolicy(worker)).toEqual({
    value: 'default',
    levelOfControl: 'controllable_by_this_extension',
  });
  await expect
    .poll(() => worker.evaluate(() => chrome.storage.local.get('webrtcProtection')))
    .toEqual({ webrtcProtection: false });
});
