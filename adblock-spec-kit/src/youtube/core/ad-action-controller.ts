/**
 * Ad action controller (Phase 1 — core).
 *
 * Pure and target-agnostic: it decides *what* to do to an ad and delegates the
 * *how* to an injected target. The order is fixed and safety-first:
 *
 *  1. if acting is not allowed or the attempt budget is exhausted, do nothing;
 *  2. try to click a skip button (the target reports true only when a skip
 *     button is truly rendered and interactable);
 *  3. only if there is no skip, and only when the ad's duration is finite and
 *     positive, mute, speed up and seek to `duration - epsilon` — never seeking
 *     blindly on an unknown duration.
 *
 * It never throws: any error in the target degrades to "no action".
 */

export interface ActionMedia {
  readonly muted: boolean;
  readonly playbackRate: number;
  readonly currentTime: number;
  readonly duration: number;
}

export interface ActionTarget {
  readonly media: ActionMedia | undefined;
  clickSkip(): boolean;
  mute(): void;
  setRate(rate: number): void;
  seek(time: number): void;
}

export interface ActionOutcome {
  readonly acted: boolean;
  readonly action: 'skip' | 'fast-forward' | 'none';
  readonly reason: string;
}

export interface ActionOptions {
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly skipRate: number;
  readonly epsilon: number;
  readonly canAct: boolean;
}

export function performAdAction(target: ActionTarget, opts: ActionOptions): ActionOutcome {
  try {
    if (!opts.canAct) {
      return { acted: false, action: 'none', reason: 'cannot-act' };
    }
    if (opts.attempts >= opts.maxAttempts) {
      return { acted: false, action: 'none', reason: 'max-attempts' };
    }

    let skipClicked = false;
    try {
      skipClicked = target.clickSkip();
    } catch {
      skipClicked = false;
    }
    if (skipClicked) {
      return { acted: true, action: 'skip', reason: 'skip-clicked' };
    }

    const media = target.media;
    if (media === undefined) {
      return { acted: false, action: 'none', reason: 'no-media' };
    }
    if (!Number.isFinite(media.duration) || media.duration <= 0) {
      return { acted: false, action: 'none', reason: 'no-duration' };
    }

    target.mute();
    target.setRate(opts.skipRate);
    target.seek(Math.max(0, media.duration - opts.epsilon));
    return { acted: true, action: 'fast-forward', reason: 'fast-forwarded' };
  } catch {
    return { acted: false, action: 'none', reason: 'error' };
  }
}
