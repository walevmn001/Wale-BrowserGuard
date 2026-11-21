/**
 * Local HTTP server for the golden suite (T018).
 *
 * It serves every fixture page plus the same-origin "benign" scripts, and it
 * answers the ad/tracker requests that Chromium resolves to it (see
 * `hostResolverRules`) with a script that loads. That makes blocking observable
 * as `ERR_BLOCKED_BY_CLIENT` versus a real 200 response, which DNS failure on a
 * fake hostname could never distinguish.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { buildPageHtml, goldenPages, pagePath } from './fixtures';

export interface FixtureServer {
  readonly baseUrl: string;
  readonly port: number;
  close(): Promise<void>;
}

const BENIGN_JS = 'window.__appLoaded = true;';
const AD_JS = 'window.__adLoaded = true;';

export async function startFixtureServer(): Promise<FixtureServer> {
  const pages = new Map<string, string>();
  let closed = false;

  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/assets/app.js' || pathname === '/assets/main.js') {
      response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
      response.end(BENIGN_JS);
      return;
    }
    const html = pages.get(pathname);
    response.writeHead(200, {
      'content-type': html === undefined ? 'text/javascript' : 'text/html; charset=utf-8',
      // No store: every navigation is a cold load, so load timings (AC-1.3) are
      // not skewed by the browser caching ad scripts the extension blocked.
      'cache-control': 'no-store',
    });
    response.end(html ?? AD_JS);
  });

  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  for (const page of goldenPages()) {
    pages.set(pagePath(page), buildPageHtml(page, port));
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    close: () =>
      new Promise<void>((done) => {
        if (closed) {
          done();
          return;
        }
        closed = true;
        server.close(() => done());
      }),
  };
}
