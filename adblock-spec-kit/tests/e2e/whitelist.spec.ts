import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Must match the E2E fixture line in rules/source/ads.txt. */
const BLOCKED_HOST = 'ads.example.test';
/** The page is served under this domain so we can whitelist it by name. */
const SITE_DOMAIN = 'localhost';

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>whitelist e2e</title>
    <script src="http://${BLOCKED_HOST}/ad.js"></script>
  </head>
  <body>
    ok
  </body>
</html>`;

const LAUNCH_ARGS = [
  `--disable-extensions-except=${EXTENSION_PATH}`,
  `--load-extension=${EXTENSION_PATH}`,
];

let server!: Server;
let baseUrl!: string;

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(PAGE_HTML);
  });
  // Bind on every interface so both `localhost` (v4/v6) resolve to us.
  await new Promise<void>((done) => server.listen(0, done));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://${SITE_DOMAIN}:${port}/`;
});

test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

function workerOf(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0]
    ? Promise.resolve(context.serviceWorkers()[0]!)
    : context.waitForEvent('serviceworker');
}

async function adRequestFailure(context: BrowserContext): Promise<string> {
  const page = await context.newPage();
  const failed = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().includes(BLOCKED_HOST),
  });
  await page.goto(baseUrl);
  const errorText = (await failed).failure()?.errorText ?? '';
  await page.close();
  return errorText;
}

async function hasAllowAllRule(worker: Worker): Promise<boolean> {
  return worker.evaluate(async () =>
    (await chrome.declarativeNetRequest.getDynamicRules()).some(
      (rule) => rule.action.type === 'allowAllRequests',
    ),
  );
}

async function launch(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, { headless: false, args: LAUNCH_ARGS });
}

test('whitelisting the current site stops blocking its ad requests', async () => {
  const context = await launch('');
  try {
    const worker = await workerOf(context);

    // Baseline: without a whitelist entry the ad request is blocked.
    expect(await adRequestFailure(context)).toContain('ERR_BLOCKED_BY_CLIENT');

    // Whitelisting writes storage; the worker reacts and adds the dynamic rule.
    await worker.evaluate(
      (domain) => chrome.storage.local.set({ whitelist: [domain] }),
      SITE_DOMAIN,
    );
    await expect.poll(() => hasAllowAllRule(worker)).toBe(true);

    // The same request now reaches the network layer instead of being blocked.
    expect(await adRequestFailure(context)).not.toContain('ERR_BLOCKED_BY_CLIENT');
  } finally {
    await context.close();
  }
});

test('the whitelist survives a browser restart', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'adblock-whitelist-'));

  const first = await launch(userDataDir);
  const firstWorker = await workerOf(first);
  await firstWorker.evaluate(
    (domain) => chrome.storage.local.set({ whitelist: [domain] }),
    SITE_DOMAIN,
  );
  await expect.poll(() => hasAllowAllRule(firstWorker)).toBe(true);
  await first.close();

  // Relaunch on the same profile: both the stored list and the dynamic rule
  // (which DNR persists across sessions) must still be there.
  const second = await launch(userDataDir);
  try {
    const secondWorker = await workerOf(second);
    await expect
      .poll(() =>
        secondWorker.evaluate(() =>
          chrome.storage.local.get('whitelist').then((s) => s['whitelist']),
        ),
      )
      .toEqual([SITE_DOMAIN]);
    expect(await hasAllowAllRule(secondWorker)).toBe(true);
  } finally {
    await second.close();
  }
});
