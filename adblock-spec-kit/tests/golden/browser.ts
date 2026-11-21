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

import { chromium, type BrowserContext } from '@playwright/test';

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
