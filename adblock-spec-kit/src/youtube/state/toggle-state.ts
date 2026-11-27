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
 */

export type DesiredState = 'ON' | 'OFF';
export type EffectiveState = 'ENABLED' | 'DISABLED' | 'UNKNOWN';
export type AdapterState = 'READY' | 'WAITING' | 'ERROR';
export type SnapshotState = 'AVAILABLE' | 'MISSING' | 'INVALID' | 'STALE';
export type DisplayState =
  | 'ENABLED'
  | 'DISABLED'
  | 'WAITING_FOR_ADAPTER'
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
