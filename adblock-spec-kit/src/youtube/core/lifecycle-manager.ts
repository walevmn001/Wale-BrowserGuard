/**
 * Cleanup registry for the YouTube engine (Phase 1 — core).
 *
 * Pure logic. Modules register teardown callbacks (event listeners, timers,
 * patched globals) here, and the engine runs them all in one pass on dispose.
 * Individual cleanups are isolated — a throwing cleanup never prevents the
 * others from running — and `disposeAll` is idempotent, so a double dispose
 * runs every cleanup exactly once.
 */

export class LifecycleManager {
  private readonly cleanups = new Set<() => void>();

  /** Registers a cleanup; returns a function that removes it again. */
  add(cleanup: () => void): () => void {
    this.cleanups.add(cleanup);
    return () => {
      this.cleanups.delete(cleanup);
    };
  }

  /** Runs every cleanup (each guarded), then clears. Idempotent. */
  disposeAll(): void {
    for (const cleanup of this.cleanups) {
      try {
        cleanup();
      } catch {
        // A faulty cleanup must not stop the rest of the teardown.
      }
    }
    this.cleanups.clear();
  }

  /** Number of registered cleanups not yet disposed. */
  size(): number {
    return this.cleanups.size;
  }
}
