import { describe, expect, it } from 'vitest';

import {
  SpaNavigationManager,
  type NavChange,
  type NavTargets,
} from '../../../src/youtube/core/spa-navigation';
import { FakeTimers } from '../../../src/youtube/testing/harness';

function setup(initial: NavTargets, debounceMs = 300) {
  const timers = new FakeTimers();
  const changes: NavChange[] = [];
  let targets = initial;
  const manager = new SpaNavigationManager({
    getTargets: () => targets,
    onNavigate: (change) => {
      changes.push(change);
    },
    debounceMs,
    timers,
  });
  return {
    manager,
    timers,
    changes,
    setTargets: (next: NavTargets) => {
      targets = next;
    },
  };
}

describe('SpaNavigationManager — debounce', () => {
  it('coalesces a burst of navigation events into one report', () => {
    const player = {};
    const video = {};
    const { manager, timers, changes, setTargets } = setup({ player: {}, video: {} });

    setTargets({ player, video });
    manager.notify();
    manager.notify();
    manager.notify();

    expect(changes).toHaveLength(0);
    timers.advance(300);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ playerChanged: true, videoChanged: true });
    expect(timers.pending()).toBe(0);
  });
});

describe('SpaNavigationManager — change detection', () => {
  it('reports the initial references once, then stays quiet while unchanged', () => {
    const player = {};
    const video = {};
    const { manager, changes, setTargets } = setup({ player, video });

    manager.flush(); // baseline: undefined -> {player, video}
    expect(changes).toHaveLength(1);

    setTargets({ player, video }); // same references
    manager.flush();

    expect(changes).toHaveLength(1);
    expect(manager.lastTargets()).toEqual({ player, video });
  });

  it('reports only the changed reference', () => {
    const player = {};
    const video = {};
    const { manager, changes, setTargets } = setup({ player, video });

    manager.flush(); // baseline: last = {player, video}
    setTargets({ player, video: {} });
    manager.flush();

    expect(changes).toHaveLength(2);
    expect(changes[1]).toEqual({ playerChanged: false, videoChanged: true });
  });

  it('treats a missing target lookup as undefined references', () => {
    const timers = new FakeTimers();
    const changes: NavChange[] = [];
    const manager = new SpaNavigationManager({
      getTargets: () => {
        throw new Error('DOM not ready');
      },
      onNavigate: (change) => changes.push(change),
      timers,
    });
    expect(() => manager.flush()).not.toThrow();
    expect(changes).toHaveLength(0);
  });
});

describe('SpaNavigationManager — dispose', () => {
  it('cancels a pending flush and ignores later events', () => {
    const { manager, timers, changes, setTargets } = setup({ player: {}, video: {} });

    manager.notify();
    manager.dispose();
    timers.advance(300);
    expect(changes).toHaveLength(0);

    setTargets({ player: {}, video: {} });
    manager.notify();
    manager.flush();
    expect(changes).toHaveLength(0);
  });
});
