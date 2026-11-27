/**
 * Playback recovery (Phase 4 — core).
 *
 * Pure diagnostic + level chooser (spec 11.11 and 11.20 / FR-027, FR-036). When
 * the watchdog reports a stall the engine must not blindly "fix" it: it first
 * classifies *why* playback stopped and only then chooses the least invasive
 * action, escalating as little as possible:
 *
 *  - an active ad, an unknown element, a pause, an end or a media error are
 *    NEVER given a seek — recovery is passive (log / wait) at most;
 *  - sustained buffering and a missing buffer are waited out, never reloaded;
 *  - only a genuine player stall on an otherwise-playable element, after the
 *    level-1 grace, moves to a resync (level 2) then a single gentle
 *    `currentTime = currentTime` nudge (level 3), rate-limited by a cooldown;
 *  - past `maxAttempts`, or on a suspected engine fault, it recommends DISABLED
 *    (level 4 — stop intervening for this video).
 *
 * It is pure logic: it decides and counts, it does not touch the media. The
 * world-aware driver reads `level` and only performs NUDGE/RESYNC itself.
 */

import { TUNING } from '../config/tuning';

export type RecoveryCause =
  | 'AD_ACTIVE'
  | 'BUFFERING'
  | 'NO_BUFFER'
  | 'MEDIA_ERROR'
  | 'SUSPECT_EXTENSION'
  | 'PLAYER_STUCK'
  | 'ENDED'
  | 'PAUSED'
  | 'UNKNOWN';

export type RecoveryLevel = 'NONE' | 'WAIT' | 'RESYNC' | 'NUDGE' | 'DISABLED';

/** The media counters the recovery diagnosis reads. */
export interface RecoveryMedia {
  readonly paused: boolean;
  readonly ended: boolean;
  readonly readyState: number;
  readonly networkState: number;
  readonly error: boolean;
  readonly currentTime: number;
  /** Seconds of media buffered ahead of `currentTime` (0 when none). */
  readonly bufferedAhead: number;
}

export interface RecoveryInput {
  /** True when the ad state machine has a confirmed active ad. */
  readonly adActive: boolean;
  readonly media: RecoveryMedia | undefined;
  /** Idle time reported by the watchdog, in milliseconds. */
  readonly stalledMs?: number;
  /** True when a previous level-3 nudge did not move `currentTime`. */
  readonly lastNudgeFailed?: boolean;
  /** True when a pruned player response lost `streamingData` (FR-036). */
  readonly suspectPruneRemovedStreaming?: boolean;
  /** True when a video request appears to have been blocked by DNR (FR-036). */
  readonly suspectBlockedVideoRequest?: boolean;
}

export interface RecoveryDecision {
  readonly cause: RecoveryCause;
  readonly level: RecoveryLevel;
  readonly reason: string;
  /** True when the driver must not touch the media (log/wait only). */
  readonly passive: boolean;
}

export interface RecoveryOptions {
  /** Total allowed recovery attempts before DISABLED (default `TUNING.recoveryMaxAttempts`). */
  readonly maxAttempts?: number;
  /** Minimum gap between two level-3 nudges (default `TUNING.recoveryCooldownMs`). */
  readonly cooldownMs?: number;
  /** Level-1 grace before any recovery touch (default `TUNING.recoveryL1Ms`). */
  readonly l1Ms?: number;
}

/** HTMLMediaElement.networkState: actively fetching the media resource. */
const NETWORK_LOADING = 2;
/** HTMLMediaElement.readyState: metadata loaded but no playable frame yet. */
const HAVE_METADATA = 1;

export class PlaybackRecovery {
  private readonly maxAttempts: number;
  private readonly cooldownMs: number;
  private readonly l1Ms: number;
  private attemptCount = 0;
  private lastNudgeAt: number | null = null;

  constructor(opts: RecoveryOptions = {}) {
    this.maxAttempts = opts.maxAttempts ?? TUNING.recoveryMaxAttempts;
    this.cooldownMs = opts.cooldownMs ?? TUNING.recoveryCooldownMs;
    this.l1Ms = opts.l1Ms ?? TUNING.recoveryL1Ms;
  }

  attempts(): number {
    return this.attemptCount;
  }

  /** True once the attempt budget is spent and no further intervention is allowed. */
  isDisabled(): boolean {
    return this.attemptCount >= this.maxAttempts;
  }

  /** Clears the per-video budget, e.g. after a player replacement. */
  reset(): void {
    this.attemptCount = 0;
    this.lastNudgeAt = null;
  }

  diagnose(input: RecoveryInput, now: number): RecoveryDecision {
    // A suspected engine fault (FR-036): never touch playback; recommend disabling
    // the suspect module rather than "recovering" a video we may have broken.
    if (input.suspectPruneRemovedStreaming === true || input.suspectBlockedVideoRequest === true) {
      this.attemptCount += 1;
      return {
        cause: 'SUSPECT_EXTENSION',
        level: this.attemptCount >= this.maxAttempts ? 'DISABLED' : 'NONE',
        reason: 'suspect-extension',
        passive: true,
      };
    }

    if (input.adActive) {
      return { cause: 'AD_ACTIVE', level: 'NONE', reason: 'ad-active', passive: true };
    }

    const media = input.media;
    if (media === undefined) {
      return { cause: 'UNKNOWN', level: 'NONE', reason: 'no-media', passive: true };
    }

    if (media.error) {
      this.attemptCount += 1;
      if (this.attemptCount >= this.maxAttempts) {
        return { cause: 'MEDIA_ERROR', level: 'DISABLED', reason: 'media-error-exhausted', passive: true };
      }
      return { cause: 'MEDIA_ERROR', level: 'NONE', reason: 'media-error', passive: true };
    }
    if (media.ended) {
      return { cause: 'ENDED', level: 'NONE', reason: 'ended', passive: true };
    }
    if (media.paused) {
      return { cause: 'PAUSED', level: 'NONE', reason: 'paused', passive: true };
    }

    // Actively loading with no playable frame yet: buffering, wait (never reload).
    if (media.networkState === NETWORK_LOADING && media.readyState <= HAVE_METADATA) {
      return { cause: 'BUFFERING', level: 'WAIT', reason: 'buffering', passive: true };
    }

    const stalledMs = input.stalledMs ?? 0;

    // No data around currentTime: a seek cannot help, so wait out the grace.
    if (media.bufferedAhead <= 0) {
      return { cause: 'NO_BUFFER', level: 'WAIT', reason: 'no-buffer', passive: true };
    }

    // Playable element, buffered, but not advancing: a genuine player stall.
    if (stalledMs < this.l1Ms) {
      return { cause: 'PLAYER_STUCK', level: 'WAIT', reason: 'l1-grace', passive: true };
    }
    if (this.attemptCount >= this.maxAttempts) {
      return { cause: 'PLAYER_STUCK', level: 'DISABLED', reason: 'max-attempts', passive: true };
    }

    // Level 2 — resync the player reference/state once.
    if (this.attemptCount === 0) {
      this.attemptCount += 1;
      return { cause: 'PLAYER_STUCK', level: 'RESYNC', reason: 'resync', passive: false };
    }

    // A nudge that already failed is not repeated: escalate or give up.
    if (input.lastNudgeFailed === true) {
      this.attemptCount += 1;
      if (this.attemptCount >= this.maxAttempts) {
        return { cause: 'PLAYER_STUCK', level: 'DISABLED', reason: 'nudge-failed-exhausted', passive: true };
      }
      return { cause: 'PLAYER_STUCK', level: 'WAIT', reason: 'nudge-failed-wait', passive: true };
    }

    // Level 3 — a single gentle nudge, rate-limited by the cooldown.
    if (this.lastNudgeAt !== null && now - this.lastNudgeAt < this.cooldownMs) {
      return { cause: 'PLAYER_STUCK', level: 'WAIT', reason: 'cooldown', passive: true };
    }
    this.attemptCount += 1;
    this.lastNudgeAt = now;
    return { cause: 'PLAYER_STUCK', level: 'NUDGE', reason: 'nudge', passive: false };
  }
}
