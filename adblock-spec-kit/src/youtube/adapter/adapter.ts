/**
 * Flag adapter contract (Phase 1 — adapter layer).
 *
 * Pure types and one pure classifier. An adapter is the *only* channel through
 * which the MAIN-world engine learns what the user/worker wants the flags to
 * be; the engine ships with a `NullAdapter` until the real one lands (T004).
 * `adapterStateOf` reduces an adapter status to the three-state health the
 * popup needs, without any I/O.
 */

import type { FlagSnapshot } from '../config/flags';

export type AdapterState = 'READY' | 'WAITING' | 'ERROR';

export interface AdapterStatus {
  readonly name: string;
  readonly started: boolean;
  readonly deliveredCount: number;
  readonly rejectedCount: number;
  readonly lastError: string | null;
}

export interface FlagAdapter {
  readonly name: string;
  publish(snapshot: FlagSnapshot): { readonly ok: boolean };
  onReceive(callback: (raw: unknown) => void): () => void;
  start(): void;
  dispose(): void;
  status(): AdapterStatus;
}

/**
 * Health of an adapter: a recorded error wins; a started adapter that has
 * actually delivered at least one snapshot is READY; anything else is WAITING.
 */
export function adapterStateOf(status: AdapterStatus): AdapterState {
  if (status.lastError !== null) {
    return 'ERROR';
  }
  if (status.started && status.deliveredCount > 0) {
    return 'READY';
  }
  return 'WAITING';
}
