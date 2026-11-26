/**
 * Audio state manager for the rebuilt YouTube engine (Phase 1 — core).
 *
 * Pure logic. When the engine has to force-mute a playing ad it must be able to
 * undo exactly that change and nothing more: `forceMute` records whether *we*
 * muted, `restore` only un-mutes when we did, and the user's own desired mute
 * state is always preserved. The volume is never touched — only `muted` — so
 * the user's volume slider is never silently changed.
 */

export interface AudioSnapshot {
  readonly volume: number;
  readonly muted: boolean;
}

export interface MediaAudio {
  volume: number;
  muted: boolean;
}

export class AudioStateManager {
  private user: AudioSnapshot = { volume: 1, muted: false };
  private mutedByUs = false;

  /** Records the user's desired audio state (the value to restore later). */
  adopt(user: AudioSnapshot): void {
    this.user = { volume: user.volume, muted: user.muted };
  }

  /**
   * Mutes the media only if it is not already muted, recording that the mute
   * was ours. Returns true when a change was made.
   */
  forceMute(media: MediaAudio): boolean {
    if (this.mutedByUs || media.muted) {
      return false;
    }
    media.muted = true;
    this.mutedByUs = true;
    return true;
  }

  /**
   * Restores the user's snapshot only when the current mute was ours, never a
   * stale forced value. Returns true when a change was made.
   */
  restore(media: MediaAudio): boolean {
    if (!this.mutedByUs) {
      return false;
    }
    media.muted = this.user.muted;
    this.mutedByUs = false;
    return true;
  }

  isMutedByUs(): boolean {
    return this.mutedByUs;
  }

  userState(): AudioSnapshot {
    return { ...this.user };
  }
}
