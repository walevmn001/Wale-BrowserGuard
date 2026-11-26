/**
 * Null flag adapter (Phase 1 — adapter layer).
 *
 * The placeholder the engine ships with until the real adapter lands (T004).
 * It accepts every published snapshot but delivers nothing and never invokes a
 * receive callback, so the engine keeps its A-3 defaults (all flags ON) and
 * behaves as if no adapter existed at all. All operations are idempotent and
 * side-effect free.
 */

import type { AdapterStatus, FlagAdapter } from './adapter';
import type { FlagSnapshot } from '../config/flags';

export class NullAdapter implements FlagAdapter {
  readonly name = 'null';
  private started = false;

  /** Accepts a snapshot but delivers nothing, so the delivered count stays 0. */
  publish(_snapshot: FlagSnapshot): { readonly ok: boolean } {
    return { ok: true };
  }

  /** Never calls the callback; returns a no-op unsubscribe. */
  onReceive(_callback: (raw: unknown) => void): () => void {
    return () => {
      // nothing to detach
    };
  }

  start(): void {
    this.started = true;
  }

  dispose(): void {
    this.started = false;
  }

  status(): AdapterStatus {
    return {
      name: 'null',
      started: this.started,
      deliveredCount: 0,
      rejectedCount: 0,
      lastError: null,
    };
  }
}
