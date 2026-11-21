import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installCosmeticObserver,
  type CosmeticObserverOptions,
} from '../../src/content/cosmetic-observer';

/**
 * The observer runs in the page, so it only touches `window`, `document`,
 * `MutationObserver` and the element API. This suite stubs exactly those (plus
 * fake timers) to drive the throttle/dormant logic deterministically without a
 * browser. Real wiring is covered by `tests/e2e/cosmetic-observer.spec.ts`.
 */

interface FakeElement {
  readonly nodeType: 1;
  hidden: boolean;
  matches(selector: string): boolean;
  querySelectorAll(selector: string): FakeElement[];
  style: {
    getPropertyValue(property: string): string;
    getPropertyPriority(property: string): string;
    setProperty(property: string, value: string): void;
  };
}

function makeElement(classes: readonly string[] = []): FakeElement {
  const element: FakeElement = {
    nodeType: 1,
    hidden: false,
    matches: (selector) => selector.startsWith('.') && classes.includes(selector.slice(1)),
    querySelectorAll: () => [],
    style: {
      getPropertyValue: (property) => (property === 'display' && element.hidden ? 'none' : ''),
      getPropertyPriority: (property) =>
        property === 'display' && element.hidden ? 'important' : '',
      setProperty: (property, value) => {
        if (property === 'display' && value === 'none') {
          element.hidden = true;
        }
      },
    },
  };
  return element;
}

function toNodeList(nodes: readonly FakeElement[]): NodeListOf<Element> {
  const list: Record<string, unknown> = { length: nodes.length };
  nodes.forEach((node, index) => {
    list[String(index)] = node;
  });
  return list as unknown as NodeListOf<Element>;
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = [];

  private readonly callback: (records: MutationRecord[]) => void;

  constructor(callback: (records: MutationRecord[]) => void) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }

  observe(): void {}
  disconnect(): void {}

  emit(added: readonly FakeElement[]): void {
    this.callback([{ addedNodes: toNodeList(added) } as unknown as MutationRecord]);
  }
}

const globals = globalThis as unknown as Record<string, unknown>;
const OPTIONS: CosmeticObserverOptions = { idleMs: 400, throttleMs: 50, bigBatch: 3 };

function latestObserver(): FakeMutationObserver {
  const observer = FakeMutationObserver.instances.at(-1);
  if (observer === undefined) {
    throw new Error('no observer was installed');
  }
  return observer;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeMutationObserver.instances = [];
  delete globals['__adblockCosmeticObserver'];
  globals['window'] = globalThis;
  globals['document'] = { documentElement: makeElement() };
  globals['MutationObserver'] = FakeMutationObserver;
});

afterEach(() => {
  vi.useRealTimers();
  delete globals['window'];
  delete globals['document'];
  delete globals['MutationObserver'];
  delete globals['__adblockCosmeticObserver'];
});

describe('installCosmeticObserver', () => {
  it('installs only one observer even if called again', () => {
    installCosmeticObserver(['.ad'], OPTIONS);
    installCosmeticObserver(['.ad'], OPTIONS);

    expect(FakeMutationObserver.instances).toHaveLength(1);
  });

  it('hides a newly added matching element after the throttle, not before', () => {
    installCosmeticObserver(['.late-ad'], OPTIONS);
    const ad = makeElement(['late-ad']);

    latestObserver().emit([ad]);
    expect(ad.hidden).toBe(false);

    vi.advanceTimersByTime(OPTIONS.throttleMs);
    expect(ad.hidden).toBe(true);
  });

  it('throttles: additions within the window flush together', () => {
    installCosmeticObserver(['.late-ad'], OPTIONS);
    const first = makeElement(['late-ad']);
    const second = makeElement(['late-ad']);

    latestObserver().emit([first]);
    vi.advanceTimersByTime(20); // < throttleMs: no flush yet
    expect(first.hidden).toBe(false);

    latestObserver().emit([second]);
    vi.advanceTimersByTime(40); // crosses the throttle window
    expect(first.hidden).toBe(true);
    expect(second.hidden).toBe(true);
  });

  it('goes dormant when idle and ignores a small added batch', () => {
    installCosmeticObserver(['.late-ad'], OPTIONS);
    const initial = makeElement(['late-ad']);

    latestObserver().emit([initial]);
    vi.advanceTimersByTime(OPTIONS.throttleMs);
    expect(initial.hidden).toBe(true);

    vi.advanceTimersByTime(OPTIONS.idleMs); // nothing happens → dormant
    const noise = makeElement(['late-ad']);
    latestObserver().emit([noise]);
    vi.advanceTimersByTime(OPTIONS.throttleMs);

    expect(noise.hidden).toBe(false);
  });

  it('wakes back up on a big added batch', () => {
    installCosmeticObserver(['.late-ad'], OPTIONS);
    latestObserver().emit([makeElement(['late-ad'])]);
    vi.advanceTimersByTime(OPTIONS.throttleMs);
    vi.advanceTimersByTime(OPTIONS.idleMs); // dormant

    const batch = [makeElement(['late-ad']), makeElement(['late-ad']), makeElement(['late-ad'])];
    latestObserver().emit(batch);
    vi.advanceTimersByTime(OPTIONS.throttleMs);

    expect(batch.map((element) => element.hidden)).toEqual([true, true, true]);
  });
});
