import { describe, expect, it } from 'vitest';

import {
  DomObserver,
  type ObserverInit,
  type ObserverLike,
} from '../../../src/youtube/core/dom-observer';
import { FakeTimers } from '../../../src/youtube/testing/harness';

/** A `MutationObserver` stand-in that the test drives by hand. */
class FakeObserver implements ObserverLike {
  static instances: FakeObserver[] = [];
  observed: Array<{ target: object; options: ObserverInit }> = [];
  disconnected = 0;
  private readonly callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }

  observe(target: object, options: ObserverInit): void {
    this.observed.push({ target, options });
  }

  disconnect(): void {
    this.disconnected += 1;
  }

  /** Simulates the browser firing a batch of mutations. */
  fire(): void {
    this.callback();
  }
}

function setup(debounceMs = 150) {
  FakeObserver.instances = [];
  const timers = new FakeTimers();
  const notifications: number[] = [];
  let count = 0;
  const observer = new DomObserver({
    createObserver: (cb) => new FakeObserver(cb),
    onNotify: () => {
      count += 1;
      notifications.push(count);
    },
    debounceMs,
    timers,
  });
  return { observer, timers, notifications, last: () => FakeObserver.instances.at(-1) };
}

describe('DomObserver — observation', () => {
  it('observes the target once with the class/child options', () => {
    const { observer, last } = setup();
    const target = {};
    observer.observe(target);

    expect(observer.isObserving()).toBe(true);
    expect(last()!.observed).toHaveLength(1);
    expect(last()!.observed[0]!.target).toBe(target);
    expect(last()!.observed[0]!.options).toMatchObject({
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  });

  it('re-observing disconnects the previous observer first', () => {
    const { observer, last } = setup();
    observer.observe({});
    const first = last()!;
    observer.observe({});

    expect(first.disconnected).toBe(1);
    expect(observer.isObserving()).toBe(true);
  });
});

describe('DomObserver — debounced notify', () => {
  it('coalesces a burst of mutations into a single notification', () => {
    const { observer, timers, notifications, last } = setup(150);
    observer.observe({});
    const fake = last()!;

    fake.fire();
    fake.fire();
    fake.fire();
    expect(notifications).toHaveLength(0);

    timers.advance(150);
    expect(notifications).toHaveLength(1);
    expect(timers.pending()).toBe(0);
  });

  it('cancels a pending notification when disconnected', () => {
    const { observer, timers, notifications, last } = setup(150);
    observer.observe({});
    last()!.fire();

    observer.disconnect();
    timers.advance(150);
    expect(notifications).toHaveLength(0);
    expect(observer.isObserving()).toBe(false);
  });

  it('keeps working after an onNotify failure (fail-open)', () => {
    const timers = new FakeTimers();
    let calls = 0;
    const observer = new DomObserver({
      createObserver: (cb) => new FakeObserver(cb),
      onNotify: () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('consumer blew up');
        }
      },
      debounceMs: 150,
      timers,
    });
    observer.observe({});
    const fake = FakeObserver.instances.at(-1)!;

    fake.fire();
    expect(() => timers.advance(150)).not.toThrow();
    fake.fire();
    expect(() => timers.advance(150)).not.toThrow();
    expect(calls).toBe(2);
  });
});

describe('DomObserver — disconnect', () => {
  it('is idempotent and safe before observing', () => {
    const { observer } = setup();
    expect(() => observer.disconnect()).not.toThrow();
    observer.observe({});
    observer.disconnect();
    observer.disconnect();
    expect(observer.isObserving()).toBe(false);
  });

  it('stays disconnected when the target cannot be observed', () => {
    const timers = new FakeTimers();
    const observer = new DomObserver({
      createObserver: () => {
        throw new Error('no observer');
      },
      onNotify: () => undefined,
      timers,
    });
    expect(() => observer.observe({})).not.toThrow();
    expect(observer.isObserving()).toBe(false);
  });
});
