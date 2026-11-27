/**
 * Timer seam for the rebuilt YouTube engine (Phase 5 — core).
 *
 * Core modules that need a debounce (SPA navigation, DOM observer) take their
 * timing through this tiny interface instead of calling `setTimeout` directly.
 * That keeps the modules world-independent and lets a test drive them with a
 * fully deterministic fake clock.
 *
 * `realTimers` is the production wiring: it is the ambient `setTimeout` /
 * `clearTimeout`, which exist in both the page and Node, so nothing here
 * reaches for `window`, `document` or `chrome`.
 */

export type TimerHandle = ReturnType<typeof setTimeout>;

export interface TimerApi {
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export const realTimers: TimerApi = {
  setTimeout(fn, ms) {
    return setTimeout(fn, ms);
  },
  clearTimeout(handle) {
    clearTimeout(handle);
  },
};
