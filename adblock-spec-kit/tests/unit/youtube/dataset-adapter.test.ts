import { describe, expect, it, vi } from 'vitest';

import {
  DatasetAdapter,
  FLAG_DATASET_ATTRIBUTE,
  type AttributeObserver,
  type AttributeTarget,
} from '../../../src/youtube/adapter/dataset-adapter';
import {
  DEFAULT_FLAGS,
  FLAG_SCHEMA_VERSION,
  type FlagSnapshot,
} from '../../../src/youtube/config/flags';

/** An in-memory stand-in for the element the snapshot rides on. */
class FakeTarget implements AttributeTarget {
  readonly attrs = new Map<string, string>();
  getFails = false;
  setFails = false;

  getAttribute(name: string): string | null {
    if (this.getFails) {
      throw new Error('get failed');
    }
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    if (this.setFails) {
      throw new Error('set failed');
    }
    this.attrs.set(name, value);
  }
}

/** A MutationObserver stand-in that records its target and can be fired by hand. */
class FakeObserver implements AttributeObserver {
  callback: () => void;
  observed = false;
  disconnected = false;

  constructor(callback: () => void) {
    this.callback = callback;
  }

  observe(): void {
    this.observed = true;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  fire(): void {
    this.callback();
  }
}

function snapshot(): FlagSnapshot {
  return {
    schemaVersion: FLAG_SCHEMA_VERSION,
    flags: { ...DEFAULT_FLAGS },
    source: 'adapter',
    receivedAt: 1,
  };
}

function makeAdapter(): {
  readonly adapter: DatasetAdapter;
  readonly target: FakeTarget;
  readonly observer: FakeObserver;
} {
  const target = new FakeTarget();
  const observer = new FakeObserver(() => undefined);
  const adapter = new DatasetAdapter({
    target,
    createObserver: (callback): AttributeObserver => {
      observer.callback = callback;
      return observer;
    },
  });
  return { adapter, target, observer };
}

describe('DatasetAdapter.publish', () => {
  it('writes the snapshot as one JSON attribute on the target', () => {
    const { adapter, target } = makeAdapter();
    const result = adapter.publish(snapshot());
    expect(result).toEqual({ ok: true });
    const raw = target.attrs.get(FLAG_DATASET_ATTRIBUTE);
    expect(typeof raw).toBe('string');
    expect(JSON.parse(raw as string).schemaVersion).toBe(FLAG_SCHEMA_VERSION);
  });

  it('is fail-open when the write throws', () => {
    const { adapter, target } = makeAdapter();
    target.setFails = true;
    expect(adapter.publish(snapshot())).toEqual({ ok: false });
    expect(adapter.status().lastError).toBe('set failed');
  });
});

describe('DatasetAdapter receive path', () => {
  it('delivers the current attribute value on start', () => {
    const { adapter, target } = makeAdapter();
    target.setAttribute(FLAG_DATASET_ATTRIBUTE, JSON.stringify(snapshot()));
    const received = vi.fn();
    adapter.onReceive(received);

    adapter.start();

    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0]?.[0]).toMatchObject({ schemaVersion: FLAG_SCHEMA_VERSION });
    expect(adapter.status().deliveredCount).toBe(1);
  });

  it('stays WAITING (nothing delivered) when the attribute is absent', () => {
    const { adapter } = makeAdapter();
    const received = vi.fn();
    adapter.onReceive(received);
    adapter.start();
    expect(received).not.toHaveBeenCalled();
    expect(adapter.status().deliveredCount).toBe(0);
  });

  it('delivers again when the attribute changes, via the observer', () => {
    const { adapter, target, observer } = makeAdapter();
    const received = vi.fn();
    adapter.onReceive(received);
    adapter.start();

    target.setAttribute(FLAG_DATASET_ATTRIBUTE, JSON.stringify(snapshot()));
    observer.fire();

    expect(received).toHaveBeenCalledTimes(1);
  });

  it('does not deliver the same raw value twice (dedupe)', () => {
    const { adapter, target, observer } = makeAdapter();
    target.setAttribute(FLAG_DATASET_ATTRIBUTE, JSON.stringify(snapshot()));
    const received = vi.fn();
    adapter.onReceive(received);
    adapter.start();
    observer.fire();
    expect(received).toHaveBeenCalledTimes(1);
  });

  it('counts an invalid JSON value as rejected and never calls the receiver', () => {
    const { adapter, target } = makeAdapter();
    target.setAttribute(FLAG_DATASET_ATTRIBUTE, '{ not json');
    const received = vi.fn();
    adapter.onReceive(received);
    adapter.start();
    expect(received).not.toHaveBeenCalled();
    expect(adapter.status().rejectedCount).toBe(1);
  });

  it('records a last error when reading the attribute throws', () => {
    const { adapter, target } = makeAdapter();
    target.getFails = true;
    adapter.start();
    expect(adapter.status().lastError).toBe('get failed');
  });
});

describe('DatasetAdapter lifecycle', () => {
  it('is idempotent across start and dispose, and disconnects the observer', () => {
    const { adapter, observer } = makeAdapter();
    expect(adapter.status().started).toBe(false);

    adapter.start();
    adapter.start();
    expect(adapter.status().started).toBe(true);
    expect(observer.observed).toBe(true);

    adapter.dispose();
    adapter.dispose();
    expect(adapter.status().started).toBe(false);
    expect(observer.disconnected).toBe(true);
  });

  it('stops delivering once disposed', () => {
    const { adapter, target, observer } = makeAdapter();
    const received = vi.fn();
    adapter.onReceive(received);
    adapter.start();
    adapter.dispose();

    target.setAttribute(FLAG_DATASET_ATTRIBUTE, JSON.stringify(snapshot()));
    observer.fire();
    expect(received).not.toHaveBeenCalled();
  });

  it('names itself "dataset"', () => {
    expect(makeAdapter().adapter.name).toBe('dataset');
  });
});
