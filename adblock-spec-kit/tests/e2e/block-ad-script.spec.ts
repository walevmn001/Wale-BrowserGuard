import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';

// `tests/e2e/` -> project root -> `dist/` (the built extension).
const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Must match the E2E fixture line in rules/source/ads.txt. */
const BLOCKED_HOST = 'ads.example.test';

const PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>block e2e</title>
    <script src="/app.js"></script>
    <script src="http://${BLOCKED_HOST}/ad.js"></script>
  </head>
  <body>
    ok
  </body>
</html>`;

/** Loads ad scripts by file name only, served from the page's own host (B4). */
const PATH_PAGE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>block path e2e</title>
    <script src="/app.js"></script>
    <script src="/ads.js"></script>
    <script src="/pagead.js"></script>
  </head>
  <body>
    ok
  </body>
</html>`;

/** Same-origin scripts the local server answers with JS (ad paths included). */
const JS_PATHS = new Set(['/app.js', '/ads.js', '/pagead.js']);

let context!: BrowserContext;
let server!: Server;
let baseUrl!: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0] ?? '/';
    if (JS_PATHS.has(path)) {
      response.writeHead(200, { 'content-type': 'text/javascript' });
      response.end('window.__appLoaded = true;');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(path === '/adsjs' ? PATH_PAGE_HTML : PAGE_HTML);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/`;

  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
});

test.afterAll(async () => {
  await context.close();
  await new Promise<void>((done) => server.close(() => done()));
});

function appLoaded(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __appLoaded?: boolean }).__appLoaded ?? false);
}

test('blocks a known ad script while same-origin scripts still load', async () => {
  const page = await context.newPage();

  const blocked = page.waitForEvent('requestfailed', {
    predicate: (request) => request.url().includes(BLOCKED_HOST),
  });

  await page.goto(baseUrl);

  const failure = await blocked;
  expect(failure.failure()?.errorText).toContain('ERR_BLOCKED_BY_CLIENT');
  await expect.poll(() => appLoaded(page)).toBe(true);
});

test('blocks the same ad domain for both fetch() and image requests', async () => {
  const page = await context.newPage();
  await page.goto(baseUrl);

  const failedTypes: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.url().includes(BLOCKED_HOST)) {
      failedTypes.push(request.resourceType());
    }
  });

  const fetchOutcome = await page.evaluate(
    (host) =>
      fetch(`http://${host}/beacon`).then(
        () => 'ok',
        () => 'blocked',
      ),
    BLOCKED_HOST,
  );

  const imageOutcome = await page.evaluate(
    (host) =>
      new Promise<string>((resolve) => {
        const image = new Image();
        image.onload = () => resolve('ok');
        image.onerror = () => resolve('blocked');
        image.src = `http://${host}/pixel.png`;
      }),
    BLOCKED_HOST,
  );

  expect(fetchOutcome).toBe('blocked');
  expect(imageOutcome).toBe('blocked');
  // A bare `||domain^` rule sets no resourceTypes, so it must block the
  // xmlhttprequest/fetch and the image sub-resource alike.
  expect(failedTypes).toEqual(expect.arrayContaining(['fetch', 'image']));
});

test('blocks ads.js and pagead.js by file name whatever host serves them (B4)', async () => {
  const page = await context.newPage();
  const failures = new Map<string, string>();
  page.on('requestfailed', (request) => {
    const { pathname } = new URL(request.url());
    if (pathname === '/ads.js' || pathname === '/pagead.js') {
      failures.set(pathname, request.failure()?.errorText ?? '');
    }
  });

  await page.goto(`${baseUrl}adsjs`);

  await expect.poll(() => failures.size, { timeout: 1000 }).toBe(2);
  expect([...failures.keys()].sort()).toEqual(['/ads.js', '/pagead.js']);
  expect([...failures.values()].every((text) => text.includes('ERR_BLOCKED_BY_CLIENT'))).toBe(
    true,
  );
  // The same-origin `/app.js` still runs, so the page is not broken.
  await expect.poll(() => appLoaded(page)).toBe(true);
});
