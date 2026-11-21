/**
 * Chromium launch helpers for the golden suite (T018).
 *
 * Every launch pins the known ad/tracker hostnames to the local fixture server
 * via `--host-resolver-rules` (see `fixtures.ts`), so a request that is *not*
 * blocked really loads instead of failing at DNS. The extension is loaded the
 * same way as the e2e suite: a persistent, headed context pointed at `dist/`.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type BrowserContext, type CDPSession } from '@playwright/test';

import { KNOWN_HOSTS } from './fixtures';

/** `tests/golden/` -> project root -> `dist/` (the built extension). */
export const EXTENSION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Builds the `--host-resolver-rules` value that maps every host to localhost. */
export function hostResolverRules(hosts: readonly string[] = KNOWN_HOSTS): string {
  return hosts.map((host) => `MAP ${host} 127.0.0.1`).join(', ');
}

export interface LaunchOptions {
  readonly extension: boolean;
  /** Reuse a profile across launches to simulate a browser restart (AC-1.4). */
  readonly userDataDir?: string;
}

export function launchContext(options: LaunchOptions): Promise<BrowserContext> {
  // `--no-proxy-server` keeps Chromium from honouring the sandbox's HTTP(S)_PROXY
  // env, which would otherwise route the (mapped) ad hosts off-box and hang.
  const args = ['--no-proxy-server', `--host-resolver-rules=${hostResolverRules()}`];
  if (options.extension) {
    args.push(
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    );
  }
  return chromium.launchPersistentContext(options.userDataDir ?? '', {
    headless: false,
    args,
  });
}

/** `Runtime.getHeapUsage`'s reply for one service worker (bytes). */
interface HeapUsage {
  readonly usedSize: number;
  readonly totalSize: number;
}

/** The service-worker target we want to measure, or `null` if none is live. */
async function extensionWorkerTargetId(session: CDPSession): Promise<string | null> {
  const { targetInfos } = await session.send('Target.getTargets');
  const worker = targetInfos.find(
    (info) => info.type === 'service_worker' && info.url.startsWith('chrome-extension://'),
  );
  return worker?.targetId ?? null;
}

/** Sends `Runtime.getHeapUsage` to an attached target and awaits its reply. */
function requestHeapUsage(session: CDPSession, targetSessionId: string): Promise<HeapUsage | null> {
  return new Promise((resolve) => {
    const requestId = 1;
    let settled = false;
    function finish(value: HeapUsage | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session.off('Target.receivedMessageFromTarget', onMessage);
      resolve(value);
    }
    function onMessage(event: { sessionId: string; message: string }): void {
      if (event.sessionId !== targetSessionId) return;
      const reply = JSON.parse(event.message) as { id?: number; result?: HeapUsage };
      if (reply.id !== requestId) return;
      finish(reply.result ?? null);
    }
    const timer = setTimeout(() => finish(null), 5000);
    session.on('Target.receivedMessageFromTarget', onMessage);
    void session.send('Target.sendMessageToTarget', {
      sessionId: targetSessionId,
      message: JSON.stringify({ id: requestId, method: 'Runtime.getHeapUsage', params: {} }),
    });
  });
}

/**
 * Reads the extension service worker's live JS-heap usage in MB (T040,
 * Constitution 15 / test-golden §2). Returns `null` when no worker is up or the
 * read times out, so the baseline records "not measured" instead of crashing.
 *
 * `context.newCDPSession(worker)` rejects a service worker ("expected Page or
 * Frame"), so we attach to the SW target from a browser-level session instead.
 */
export async function readServiceWorkerHeapMb(context: BrowserContext): Promise<number | null> {
  const browser = context.browser();
  if (browser === null) {
    return null;
  }
  const session = await browser.newBrowserCDPSession();
  try {
    const targetId = await extensionWorkerTargetId(session);
    if (targetId === null) {
      return null;
    }
    const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: false });
    const heap = await requestHeapUsage(session, sessionId);
    await session.send('Target.detachFromTarget', { sessionId }).catch(() => undefined);
    return heap === null ? null : heap.usedSize / 1048576;
  } finally {
    await session.detach();
  }
}
