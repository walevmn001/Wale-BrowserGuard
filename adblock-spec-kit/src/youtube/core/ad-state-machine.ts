/**
 * Ad lifecycle state machine (Phase 1 — core).
 *
 * A pure, deterministic reducer: given the current state and one event it
 * returns the next state. It owns no timers and no DOM, so the transitions are
 * exhaustively testable and cannot depend on how fast the page is.
 *
 * The machine enforces the safety invariants: `DISABLED` is absorbing except
 * for an explicit `ENABLE`, a disabled engine can never enter `RECOVERY`, and
 * acting events (`AD_STARTED`, `SKIP_CLICKED`) only increment `attempts` while
 * the per-ad budget (`maxAttempts`) has not been exhausted.
 */

import { TUNING } from '../config/tuning';

export type AdState =
  | 'IDLE'
  | 'AD_DETECTED'
  | 'AD_ACTIVE'
  | 'SKIP_PENDING'
  | 'AD_ENDING'
  | 'RECOVERY'
  | 'DISABLED';

export type AdEvent =
  | { type: 'DETECTED'; hasSkipButton: boolean }
  | { type: 'AD_STARTED' }
  | { type: 'SKIP_CLICKED' }
  | { type: 'AD_ENDED' }
  | { type: 'RECOVERY_STARTED' }
  | { type: 'RECOVERY_DONE' }
  | { type: 'DISABLE' }
  | { type: 'ENABLE' };

export interface AdMachineState {
  readonly state: AdState;
  readonly attempts: number;
  readonly updatedAt: number;
}

export function initialAdState(now: number): AdMachineState {
  return { state: 'IDLE', attempts: 0, updatedAt: now };
}

/** A state from which no automatic transition is taken (only `ENABLE` leaves). */
export function isTerminal(state: AdState): boolean {
  return state === 'DISABLED';
}

/** The next state for a move that changes the state but keeps the attempt count. */
function move(
  state: AdState,
  attempts: number,
  now: number,
): AdMachineState {
  return { state, attempts, updatedAt: now };
}

/** The next state for an acting move that also counts one attempt. */
function act(
  state: AdState,
  attempts: number,
  now: number,
): AdMachineState {
  return { state, attempts: attempts + 1, updatedAt: now };
}

/**
 * Deterministic transition. `maxAttempts` (default `TUNING.skipMaxAttempts`)
 * caps how many acting moves are allowed per ad; once reached, further acting
 * events leave the state unchanged.
 */
export function reduce(
  state: AdMachineState,
  event: AdEvent,
  now: number,
  maxAttempts: number = TUNING.skipMaxAttempts,
): AdMachineState {
  // DISABLED is absorbing: only ENABLE leaves it, and RECOVERY is unreachable.
  if (state.state === 'DISABLED') {
    if (event.type === 'ENABLE') {
      return move('IDLE', 0, now);
    }
    return state;
  }
  if (event.type === 'ENABLE') {
    return state;
  }
  if (event.type === 'DISABLE') {
    return move('DISABLED', 0, now);
  }

  switch (state.state) {
    case 'IDLE':
      if (event.type === 'DETECTED') {
        return move(event.hasSkipButton ? 'SKIP_PENDING' : 'AD_DETECTED', state.attempts, now);
      }
      return state;

    case 'AD_DETECTED':
      if (event.type === 'AD_STARTED') {
        if (state.attempts >= maxAttempts) {
          return state;
        }
        return act('AD_ACTIVE', state.attempts, now);
      }
      if (event.type === 'DETECTED' && event.hasSkipButton) {
        return move('SKIP_PENDING', state.attempts, now);
      }
      if (event.type === 'AD_ENDED') {
        return move('AD_ENDING', state.attempts, now);
      }
      return state;

    case 'AD_ACTIVE':
      if (event.type === 'SKIP_CLICKED') {
        if (state.attempts >= maxAttempts) {
          return move('AD_ENDING', state.attempts, now);
        }
        return act('SKIP_PENDING', state.attempts, now);
      }
      if (event.type === 'AD_ENDED') {
        return move('AD_ENDING', state.attempts, now);
      }
      if (event.type === 'RECOVERY_STARTED') {
        return move('RECOVERY', state.attempts, now);
      }
      return state;

    case 'SKIP_PENDING':
      if (event.type === 'SKIP_CLICKED') {
        if (state.attempts >= maxAttempts) {
          return state;
        }
        return act('SKIP_PENDING', state.attempts, now);
      }
      if (event.type === 'AD_STARTED') {
        if (state.attempts >= maxAttempts) {
          return state;
        }
        return act('AD_ACTIVE', state.attempts, now);
      }
      if (event.type === 'AD_ENDED') {
        return move('AD_ENDING', state.attempts, now);
      }
      if (event.type === 'RECOVERY_STARTED') {
        return move('RECOVERY', state.attempts, now);
      }
      return state;

    case 'AD_ENDING':
      if (event.type === 'AD_ENDED') {
        return move('IDLE', 0, now);
      }
      if (event.type === 'DETECTED') {
        return move(event.hasSkipButton ? 'SKIP_PENDING' : 'AD_DETECTED', 0, now);
      }
      if (event.type === 'RECOVERY_STARTED') {
        return move('RECOVERY', state.attempts, now);
      }
      return state;

    case 'RECOVERY':
      if (event.type === 'RECOVERY_DONE') {
        return move('IDLE', 0, now);
      }
      if (event.type === 'AD_ENDED') {
        return move('AD_ENDING', state.attempts, now);
      }
      return state;

    default:
      return state;
  }
}
