/**
 * Temporary protection pause (Phase 9 §2, AC-pause).
 *
 * Pausing stores an expiry timestamp (`pausedUntil`); the ruleset manager reads
 * it and treats a live pause as "everything off", so blocking stops without
 * touching the user's master switch. An alarm wakes the worker when the pause
 * lapses so protection resumes on its own even if no page loads.
 *
 * "Until I turn it back on" is stored as {@link INDEFINITE}, a large sentinel
 * that is JSON-safe (unlike `Infinity`, which `chrome.storage` would null).
 *
 * State lives in `chrome.storage`, never a module variable (Constitution 14).
 */

import { logger } from '../shared/logger';
import { TypedStorage } from '../shared/storage';

/** Alarm that fires when a timed pause lapses. */
export const PAUSE_ALARM = 'pause-expired';

/** Sentinel for a pause with no expiry. */
export const INDEFINITE = Number.MAX_SAFE_INTEGER;

/** The pause lengths the UI offers, in milliseconds; `null` = indefinite. */
export const PAUSE_OPTIONS = {
  five: 5 * 60 * 1000,
  fifteen: 15 * 60 * 1000,
  thirty: 30 * 60 * 1000,
} as const;

export interface PauseState {
  readonly paused: boolean;
  /** Expiry timestamp when timed, `null` when indefinite, absent when running. */
  readonly until: number | null;
}

export interface ProtectionPauseDeps {
  readonly storage: TypedStorage;
  readonly now: () => number;
  readonly scheduleAlarm: (when: number) => Promise<void>;
  readonly clearAlarm: () => Promise<void>;
}

export class ProtectionPause {
  private readonly deps: ProtectionPauseDeps;

  constructor(deps: ProtectionPauseDeps) {
    this.deps = deps;
  }

  /** Whether protection is paused right now (expired pauses count as running). */
  async isPaused(): Promise<boolean> {
    const until = await this.deps.storage.get('pausedUntil');
    return until !== undefined && until > this.deps.now();
  }

  /** Current pause state for the UI: running, timed (with expiry) or indefinite. */
  async state(): Promise<PauseState> {
    const until = await this.deps.storage.get('pausedUntil');
    if (until === undefined || until <= this.deps.now()) {
      return { paused: false, until: null };
    }
    return { paused: true, until: until >= INDEFINITE ? null : until };
  }

  /** Pauses for `durationMs`, or indefinitely when `null`. */
  async pause(durationMs: number | null): Promise<PauseState> {
    const until = durationMs === null ? INDEFINITE : this.deps.now() + durationMs;
    await this.deps.storage.set('pausedUntil', until);
    if (until >= INDEFINITE) {
      await this.deps.clearAlarm();
    } else {
      await this.deps.scheduleAlarm(until);
    }
    logger.info(durationMs === null ? 'protection paused indefinitely' : `protection paused ${durationMs}ms`);
    return this.state();
  }

  /** Ends a pause (manual resume or alarm expiry). */
  async resume(): Promise<void> {
    await this.deps.storage.remove('pausedUntil');
    await this.deps.clearAlarm();
    logger.info('protection resumed');
  }

  /** Drops an already-expired pause; safe to call on every alarm tick. */
  async prune(): Promise<void> {
    if (!(await this.isPaused())) {
      await this.deps.storage.remove('pausedUntil');
    }
  }
}

/** Builds a pause controller backed by the real `chrome.*` APIs. */
export function createProtectionPause(): ProtectionPause {
  return new ProtectionPause({
    storage: new TypedStorage(),
    now: () => Date.now(),
    scheduleAlarm: (when) => chrome.alarms.create(PAUSE_ALARM, { when }),
    clearAlarm: async () => {
      await chrome.alarms.clear(PAUSE_ALARM);
    },
  });
}
