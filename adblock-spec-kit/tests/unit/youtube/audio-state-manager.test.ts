import { describe, expect, it } from 'vitest';

import { AudioStateManager, type MediaAudio } from '../../../src/youtube/core/audio-state-manager';

function media(overrides: Partial<MediaAudio> = {}): MediaAudio {
  return { volume: 1, muted: false, ...overrides };
}

describe('AudioStateManager', () => {
  it('force-mutes once and records that the mute was ours', () => {
    const manager = new AudioStateManager();
    const element = media();

    expect(manager.forceMute(element)).toBe(true);
    expect(element.muted).toBe(true);
    expect(manager.isMutedByUs()).toBe(true);
    expect(manager.forceMute(element)).toBe(false);
  });

  it('never mutes a media the user already muted', () => {
    const manager = new AudioStateManager();
    const element = media({ muted: true });

    expect(manager.forceMute(element)).toBe(false);
    expect(manager.isMutedByUs()).toBe(false);
  });

  it('never changes the volume', () => {
    const manager = new AudioStateManager();
    const element = media({ volume: 0.35 });

    manager.forceMute(element);
    manager.restore(element);

    expect(element.volume).toBe(0.35);
  });

  it('restores the user state only after we muted, then reports no mute of ours', () => {
    const manager = new AudioStateManager();
    manager.adopt({ volume: 0.5, muted: false });
    const element = media({ volume: 0.5 });

    manager.forceMute(element);
    expect(manager.restore(element)).toBe(true);
    expect(element.muted).toBe(false);
    expect(manager.isMutedByUs()).toBe(false);
    expect(manager.restore(element)).toBe(false);
  });

  it('does not touch a media it never muted', () => {
    const manager = new AudioStateManager();
    const element = media();

    expect(manager.restore(element)).toBe(false);
    expect(element.muted).toBe(false);
  });

  it("restores the user's mute preference rather than a stale forced value", () => {
    const manager = new AudioStateManager();
    manager.adopt({ volume: 1, muted: true });
    const element = media({ muted: false });

    expect(manager.forceMute(element)).toBe(true);
    expect(manager.restore(element)).toBe(true);
    expect(element.muted).toBe(true);
  });

  it('returns a defensive copy of the user state', () => {
    const manager = new AudioStateManager();
    manager.adopt({ volume: 0.2, muted: true });

    const first = manager.userState();
    const second = manager.userState();

    expect(first).toEqual({ volume: 0.2, muted: true });
    expect(first).not.toBe(second);
  });
});
