/**
 * Popup toggle-state resolution (Phase 1 — state layer).
 *
 * Pure logic that models the popup-state contract: it takes the *desired* state
 * (what the user asked for), the *effective* state (what the engine actually
 * did), the *adapter* health and the *snapshot* freshness, and resolves exactly
 * one display state plus the mandatory Vietnamese message.
 *
 * The priority table is fixed and must not be reordered — a transient condition
 * (an erroring or not-yet-ready adapter) always wins over the nominal state, so
 * the popup never claims ON/OFF while the engine is still settling.
 *
 * CHECKPOINT FIX-01 (Phase C): a second resolver, `resolveLayerDisplay`, folds in
 * the two facts the old table could not see — whether the module is registered
 * at all and whether the MAIN engine has actually *confirmed* the hook (the
 * `installed` runtime fact relayed back from the page). Registration alone is
 * never enough to claim the hook works.
 */

import type { YtModuleRuntime } from './runtime-status';

export type DesiredState = 'ON' | 'OFF';
export type EffectiveState = 'ENABLED' | 'DISABLED' | 'UNKNOWN';
export type AdapterState = 'READY' | 'WAITING' | 'ERROR';
export type SnapshotState = 'AVAILABLE' | 'MISSING' | 'INVALID' | 'STALE';
export type DisplayState =
  | 'ENABLED'
  | 'DISABLED'
  | 'WAITING_FOR_REGISTRATION'
  | 'WAITING_FOR_ADAPTER'
  | 'INITIALIZING'
  | 'RECONCILING'
  | 'ERROR'
  | 'UNKNOWN';

export interface ToggleInputs {
  readonly desired: DesiredState;
  readonly effective: EffectiveState;
  readonly adapter: AdapterState;
  readonly snapshot: SnapshotState;
}

export interface DisplayResolution {
  readonly state: DisplayState;
  readonly reason?: string;
}

/**
 * Applies the 7-rule priority table:
 *  1. adapter ERROR → ERROR;
 *  2. adapter WAITING or snapshot MISSING/INVALID → WAITING_FOR_ADAPTER;
 *  3. snapshot STALE → RECONCILING;
 *  4. effective UNKNOWN → UNKNOWN;
 *  5. effective ENABLED and desired ON → ENABLED;
 *  6. effective DISABLED and desired OFF → DISABLED;
 *  7. otherwise ERROR (reason `mismatch`).
 */
export function resolveDisplay(input: ToggleInputs): DisplayResolution {
  if (input.adapter === 'ERROR') {
    return { state: 'ERROR', reason: 'adapter-error' };
  }
  if (input.adapter === 'WAITING') {
    return { state: 'WAITING_FOR_ADAPTER', reason: 'adapter-waiting' };
  }
  if (input.snapshot === 'MISSING') {
    return { state: 'WAITING_FOR_ADAPTER', reason: 'snapshot-missing' };
  }
  if (input.snapshot === 'INVALID') {
    return { state: 'WAITING_FOR_ADAPTER', reason: 'snapshot-invalid' };
  }
  if (input.snapshot === 'STALE') {
    return { state: 'RECONCILING', reason: 'snapshot-stale' };
  }
  if (input.effective === 'UNKNOWN') {
    return { state: 'UNKNOWN', reason: 'effective-unknown' };
  }
  if (input.effective === 'ENABLED' && input.desired === 'ON') {
    return { state: 'ENABLED' };
  }
  if (input.effective === 'DISABLED' && input.desired === 'OFF') {
    return { state: 'DISABLED' };
  }
  return { state: 'ERROR', reason: 'mismatch' };
}

/** Inputs for the runtime-aware layer resolver (CHECKPOINT FIX-01, Phase C). */
export interface LayerDisplayInputs {
  readonly desired: DesiredState;
  readonly adapter: AdapterState;
  readonly snapshot: SnapshotState;
  /** The module switch: false means the user turned the whole engine off. */
  readonly moduleEnabled: boolean;
  /** The MAIN content script is registered for YouTube. */
  readonly registered: boolean;
  /** The MAIN runtime facts for this layer, or null when none confirmed yet. */
  readonly runtime: YtModuleRuntime | null;
}

/**
 * Resolves the display state of one MAIN layer from the runtime handshake. It
 * extends the priority table with the two facts registration-only could not see,
 * in this fixed order:
 *  0. module switch off                         → DISABLED;
 *  1. not registered                            → WAITING_FOR_REGISTRATION;
 *  2. adapter ERROR                             → ERROR;
 *  3. registered but no confirmed status yet    → INITIALIZING;
 *  4. adapter WAITING / snapshot MISSING/INVALID → WAITING_FOR_ADAPTER;
 *  5. snapshot STALE                            → RECONCILING;
 *  6. confirmed facts → enabled+installed = ENABLED (READY), flag off = DISABLED,
 *     otherwise ERROR (a flag that could not be honoured is never "working").
 *
 * A hook is only ever reported ENABLED (READY) when the page confirmed it is
 * *installed* — the exact check the popup must not fake from registration.
 */
export function resolveLayerDisplay(input: LayerDisplayInputs): DisplayResolution {
  if (!input.moduleEnabled) {
    return { state: 'DISABLED', reason: 'module-off' };
  }
  if (!input.registered) {
    return { state: 'WAITING_FOR_REGISTRATION', reason: 'registration-missing' };
  }
  if (input.adapter === 'ERROR') {
    return { state: 'ERROR', reason: 'adapter-error' };
  }
  if (input.runtime === null) {
    return { state: 'INITIALIZING', reason: 'awaiting-status' };
  }
  if (input.adapter === 'WAITING') {
    return { state: 'WAITING_FOR_ADAPTER', reason: 'adapter-waiting' };
  }
  if (input.snapshot === 'MISSING') {
    return { state: 'WAITING_FOR_ADAPTER', reason: 'snapshot-missing' };
  }
  if (input.snapshot === 'INVALID') {
    return { state: 'WAITING_FOR_ADAPTER', reason: 'snapshot-invalid' };
  }
  if (input.snapshot === 'STALE') {
    return { state: 'RECONCILING', reason: 'snapshot-stale' };
  }
  if (input.runtime.lastError !== null || input.runtime.failures > 0) {
    return { state: 'ERROR', reason: input.runtime.lastError ?? 'module-failures' };
  }
  if (input.desired === 'ON') {
    if (input.runtime.enabled && input.runtime.installed) {
      return { state: 'ENABLED' };
    }
    return { state: 'ERROR', reason: input.runtime.enabled ? 'not-installed' : 'mismatch' };
  }
  // desired OFF: only a hook the engine agrees is off counts as DISABLED.
  return input.runtime.enabled
    ? { state: 'ERROR', reason: 'mismatch' }
    : { state: 'DISABLED' };
}

/** Display states that mean "a saved choice is still pending, not yet applied". */
const PENDING_STATES: ReadonlySet<DisplayState> = new Set<DisplayState>([
  'WAITING_FOR_REGISTRATION',
  'WAITING_FOR_ADAPTER',
  'INITIALIZING',
  'RECONCILING',
]);

/** True when a state is a not-yet-applied transient (contract §5.1). */
export function isPendingState(state: DisplayState): boolean {
  return PENDING_STATES.has(state);
}
