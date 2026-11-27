/**
 * Runtime status handshake for the rebuilt YouTube engine (FIX-01, Phase C).
 *
 * The popup must never claim a MAIN-world hook is `READY` just because the
 * content script is registered (the old `isEngineRegistered()` shortcut). This
 * module is the missing MAIN → ISOLATED channel: the MAIN engine serialises a
 * small status JSON onto a second root attribute (`data-wg-yt-status`), the
 * ISOLATED bridge reads it back on demand, and the popup resolves one of six
 * component states per hook from it.
 *
 * It is deliberately pure: the shape, the strict parser and the six-state
 * resolver are the only things the popup, the MAIN writer and the tests share,
 * and none of them touches a page or extension global (architecture test).
 */

import type { AdapterState } from '../adapter/adapter';

/** Root-element attribute that carries the MAIN engine's runtime status. */
export const ENGINE_STATUS_ATTRIBUTE = 'data-wg-yt-status';

/** Status schema version; the popup rejects anything that does not match. */
export const ENGINE_STATUS_SCHEMA_VERSION = 1;

/** The three MAIN-world hooks whose installation state the popup shows. */
export const MAIN_HOOK_FLAGS = [
  'ENABLE_JSON_PRUNER',
  'ENABLE_FETCH_HOOK',
  'ENABLE_XHR_HOOK',
] as const;

export type MainHookFlagName = (typeof MAIN_HOOK_FLAGS)[number];

/** Per-hook runtime state reported by the MAIN engine. */
export interface EngineComponentStatus {
  /** True when the component is in the state matching `enabled` (see below). */
  readonly ready: boolean;
  /** The flag value the MAIN engine actually applied on the page. */
  readonly enabled: boolean;
}

/** The MAIN engine's runtime status, as written to the root attribute. */
export interface EngineRuntimeStatus {
  readonly schemaVersion: number;
  readonly adapter: AdapterState;
  readonly delivered: number;
  readonly hooks: Readonly<Record<MainHookFlagName, EngineComponentStatus>>;
}

/**
 * The six runtime states a MAIN hook can be in (FIX-01, Phase C). `READY` means
 * the hook is installed and confirmed to match the user's choice; the popup
 * maps it to `ENABLED`/`DISABLED`.
 */
export type ComponentRuntimeState =
  | 'DISABLED'
  | 'WAITING_FOR_REGISTRATION'
  | 'WAITING_FOR_ADAPTER'
  | 'INITIALIZING'
  | 'READY'
  | 'ERROR';

export interface ComponentStateInput {
  /** The YouTube module switch (the master on/off for the whole engine). */
  readonly moduleEnabled: boolean;
  /** True when both engine content scripts are registered for this tab. */
  readonly registered: boolean;
  /** The status the MAIN engine reported, or `undefined` when it is silent. */
  readonly status: EngineRuntimeStatus | undefined;
  /** The MAIN flag this component is gated by. */
  readonly flag: MainHookFlagName;
  /** What the user asked for (the saved switch position). */
  readonly desiredOn: boolean;
}

export interface EngineStatusInputs {
  readonly adapter: AdapterState;
  readonly delivered: number;
  readonly hooks: Readonly<Record<MainHookFlagName, EngineComponentStatus>>;
}

/** Builds the status object the MAIN engine writes onto the attribute. */
export function buildEngineStatus(inputs: EngineStatusInputs): EngineRuntimeStatus {
  const hooks = {} as Record<MainHookFlagName, EngineComponentStatus>;
  for (const flag of MAIN_HOOK_FLAGS) {
    const hook = inputs.hooks[flag];
    hooks[flag] = { ready: hook.ready === true, enabled: hook.enabled === true };
  }
  return {
    schemaVersion: ENGINE_STATUS_SCHEMA_VERSION,
    adapter: inputs.adapter,
    delivered: inputs.delivered,
    hooks,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAdapterState(value: unknown): value is AdapterState {
  return value === 'READY' || value === 'WAITING' || value === 'ERROR';
}

/**
 * Strictly parses a status attribute value. Anything that does not exactly
 * match the schema (version, adapter enum, the three hook records) is rejected
 * wholesale so a corrupt attribute can never be mistaken for a real status.
 */
export function parseEngineStatus(raw: string | null | undefined): EngineRuntimeStatus | undefined {
  if (typeof raw !== 'string' || raw === '') {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed['schemaVersion'] !== ENGINE_STATUS_SCHEMA_VERSION) {
    return undefined;
  }
  if (!isAdapterState(parsed['adapter'])) {
    return undefined;
  }
  const delivered = parsed['delivered'];
  if (typeof delivered !== 'number' || !Number.isFinite(delivered) || delivered < 0) {
    return undefined;
  }
  const rawHooks = parsed['hooks'];
  if (!isRecord(rawHooks)) {
    return undefined;
  }
  const hooks = {} as Record<MainHookFlagName, EngineComponentStatus>;
  for (const flag of MAIN_HOOK_FLAGS) {
    const hook = rawHooks[flag];
    if (!isRecord(hook) || typeof hook['ready'] !== 'boolean' || typeof hook['enabled'] !== 'boolean') {
      return undefined;
    }
    hooks[flag] = { ready: hook['ready'], enabled: hook['enabled'] };
  }
  return {
    schemaVersion: ENGINE_STATUS_SCHEMA_VERSION,
    adapter: parsed['adapter'],
    delivered,
    hooks,
  };
}

/**
 * Resolves one MAIN hook's runtime state from the module switch, registration,
 * the MAIN status and the saved choice. The order is fixed: a disabled module
 * or a missing registration is reported before the adapter, and the adapter
 * before the per-hook confirmation, so the popup never shows a nominal state
 * while the engine is still settling.
 */
export function resolveComponentState(input: ComponentStateInput): ComponentRuntimeState {
  if (!input.moduleEnabled) {
    return 'DISABLED';
  }
  if (!input.registered) {
    return 'WAITING_FOR_REGISTRATION';
  }
  const status = input.status;
  if (status === undefined) {
    return 'INITIALIZING';
  }
  if (status.adapter === 'ERROR') {
    return 'ERROR';
  }
  if (status.adapter === 'WAITING') {
    return 'WAITING_FOR_ADAPTER';
  }
  const hook = status.hooks[input.flag];
  if (hook === undefined || !hook.ready) {
    return 'INITIALIZING';
  }
  return hook.enabled === input.desiredOn ? 'READY' : 'INITIALIZING';
}
