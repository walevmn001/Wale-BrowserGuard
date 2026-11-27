/**
 * MAIN → ISOLATED runtime-status model (CHECKPOINT FIX-01, Phase C).
 *
 * The popup must not claim a hook is READY just because the engine's content
 * script is *registered* — registration only proves the code was injected, not
 * that the fetch/XHR/player hooks are actually installed in the page. To close
 * that gap the MAIN engine publishes a small, validated status record onto a
 * second root attribute (`data-wg-yt-status`), the ISOLATED bridge forwards it
 * to the worker, and the popup reads it back per tab.
 *
 * This file is pure (no `window`/`document`/`chrome` — see the architecture
 * test) so both worlds and the tests can share the exact same shape and guard.
 * The record carries only what the popup needs: the effective flags and, per
 * module, whether it is enabled (flag on) and actually installed (hook wrapped
 * / observer attached).
 */

import { FLAG_NAMES, type FlagName } from '../config/flags';
import type { ModuleStatus } from '../core/module';

/** Root-element attribute that carries the JSON runtime status (MAIN writes it). */
export const YT_STATUS_ATTRIBUTE = 'data-wg-yt-status';

/** Bumped whenever the status shape changes, so a stale payload is rejected. */
export const YT_STATUS_SCHEMA_VERSION = 1;

/** Per-module runtime facts the popup reads. */
export interface YtModuleRuntime {
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly failures: number;
  readonly lastError: string | null;
}

/** The whole record MAIN publishes and the popup consumes. */
export interface YtRuntimeStatus {
  readonly schemaVersion: number;
  readonly at: number;
  readonly url: string;
  readonly flags: Readonly<Record<FlagName, boolean>>;
  readonly modules: Readonly<Record<string, YtModuleRuntime>>;
}

/**
 * The three MAIN hook flags and the module name each one maps to. The popup
 * uses this to look up a flag's live status in `YtRuntimeStatus.modules`.
 */
export const HOOK_MODULE_BY_FLAG: Readonly<Partial<Record<FlagName, string>>> = {
  ENABLE_JSON_PRUNER: 'json-pruner',
  ENABLE_FETCH_HOOK: 'fetch-interceptor',
  ENABLE_XHR_HOOK: 'xhr-interceptor',
};

/** Builds the publishable record from the registry status and the live flags. */
export function buildRuntimeStatus(input: {
  readonly now: number;
  readonly url: string;
  readonly flags: Readonly<Record<FlagName, boolean>>;
  readonly modules: readonly ModuleStatus[];
}): YtRuntimeStatus {
  const modules: Record<string, YtModuleRuntime> = {};
  for (const module of input.modules) {
    modules[module.name] = {
      enabled: module.enabled,
      installed: module.installed,
      failures: module.failures,
      lastError: module.lastError,
    };
  }
  const flags = {} as Record<FlagName, boolean>;
  for (const name of FLAG_NAMES) {
    flags[name] = input.flags[name] === true;
  }
  return {
    schemaVersion: YT_STATUS_SCHEMA_VERSION,
    at: input.now,
    url: input.url,
    flags,
    modules,
  };
}

/** A status older than this is treated as not available (tab navigated away). */
export const YT_STATUS_MAX_AGE_MS = 10 * 60 * 1000;

/** The host of a status URL, or `undefined` when it cannot be parsed. */
export function statusHostOf(url: string): string | undefined {
  try {
    const host = new URL(url).host.toLowerCase();
    return host === '' ? undefined : host;
  } catch {
    return undefined;
  }
}

/**
 * True when a status is recent enough to trust for the *current* page. The
 * MAIN engine re-publishes on every page load and every flag change, so a stale
 * record means the tab has since navigated and the popup must not show its old
 * "READY".
 */
export function isStatusFresh(status: YtRuntimeStatus, now: number): boolean {
  const age = now - status.at;
  return age >= -60_000 && age <= YT_STATUS_MAX_AGE_MS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Runtime guard for a status payload arriving from the page (untrusted). */
export function isYtRuntimeStatus(value: unknown): value is YtRuntimeStatus {
  if (!isRecord(value)) {
    return false;
  }
  if (value['schemaVersion'] !== YT_STATUS_SCHEMA_VERSION) {
    return false;
  }
  if (typeof value['at'] !== 'number' || !Number.isFinite(value['at'])) {
    return false;
  }
  if (typeof value['url'] !== 'string') {
    return false;
  }
  const flags = value['flags'];
  if (!isRecord(flags)) {
    return false;
  }
  for (const name of FLAG_NAMES) {
    if (typeof flags[name] !== 'boolean') {
      return false;
    }
  }
  const modules = value['modules'];
  if (!isRecord(modules)) {
    return false;
  }
  for (const entry of Object.values(modules)) {
    if (!isYtModuleRuntime(entry)) {
      return false;
    }
  }
  return true;
}

function isYtModuleRuntime(value: unknown): value is YtModuleRuntime {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value['enabled'] === 'boolean' &&
    typeof value['installed'] === 'boolean' &&
    typeof value['failures'] === 'number' &&
    (value['lastError'] === null || typeof value['lastError'] === 'string')
  );
}
