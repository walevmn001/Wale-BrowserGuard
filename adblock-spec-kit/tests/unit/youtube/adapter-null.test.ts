import { describe, expect, it, vi } from 'vitest';

import { NullAdapter } from '../../../src/youtube/adapter/null-adapter';
import { adapterStateOf, type AdapterStatus } from '../../../src/youtube/adapter/adapter';
import { FLAG_SCHEMA_VERSION, type FlagSnapshot } from '../../../src/youtube/config/flags';

/** A syntactically valid snapshot; the null adapter ignores its contents. */
function snapshot(): FlagSnapshot {
  return {
    schemaVersion: FLAG_SCHEMA_VERSION,
    flags: {} as FlagSnapshot['flags'],
    source: 'adapter',
    receivedAt: 0,
  };
}

describe('NullAdapter', () => {
  it('names itself "null"', () => {
    expect(new NullAdapter().name).toBe('null');
  });

  it('accepts a publish without delivering it (deliveredCount stays 0)', () => {
    const adapter = new NullAdapter();
    expect(adapter.publish(snapshot())).toEqual({ ok: true });
    expect(adapter.status().deliveredCount).toBe(0);
  });

  it('never calls the receive callback and returns a no-op unsubscribe', () => {
    const adapter = new NullAdapter();
    const callback = vi.fn();
    const unsubscribe = adapter.onReceive(callback);

    expect(typeof unsubscribe).toBe('function');
    expect(callback).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it('is idempotent across start and dispose', () => {
    const adapter = new NullAdapter();
    expect(adapter.status().started).toBe(false);

    adapter.start();
    adapter.start();
    expect(adapter.status().started).toBe(true);

    adapter.dispose();
    adapter.dispose();
    expect(adapter.status().started).toBe(false);
  });

  it('reports a clean status', () => {
    const adapter = new NullAdapter();
    expect(adapter.status()).toEqual({
      name: 'null',
      started: false,
      deliveredCount: 0,
      rejectedCount: 0,
      lastError: null,
    });
  });
});

describe('adapterStateOf', () => {
  function status(overrides: Partial<AdapterStatus> = {}): AdapterStatus {
    return {
      name: 'test',
      started: false,
      deliveredCount: 0,
      rejectedCount: 0,
      lastError: null,
      ...overrides,
    };
  }

  it('is ERROR whenever a last error is recorded', () => {
    expect(adapterStateOf(status({ lastError: 'boom', started: true, deliveredCount: 5 }))).toBe(
      'ERROR',
    );
  });

  it('is READY once started and at least one snapshot was delivered', () => {
    expect(adapterStateOf(status({ started: true, deliveredCount: 1 }))).toBe('READY');
  });

  it('is WAITING otherwise', () => {
    expect(adapterStateOf(status())).toBe('WAITING');
    expect(adapterStateOf(status({ started: true }))).toBe('WAITING');
    expect(adapterStateOf(status({ deliveredCount: 3 }))).toBe('WAITING');
  });
});
