import { describe, expect, it } from 'vitest';

import {
  PROTECTED_KEYS,
  pruneJson,
  type PruneLimits,
} from '../../../src/youtube/core/json-pruner';

const LIMITS: PruneLimits = { maxDepth: 6, maxKeys: 100_000 };
const AD_KEYS: readonly string[] = ['adPlacements', 'playerAds', 'adSlots'];

describe('pruneJson', () => {
  it('removes top-level ad keys, counts them and returns the same reference', () => {
    const value: Record<string, unknown> = { adPlacements: [], keep: 1, playerAds: [] };
    const result = pruneJson(value, AD_KEYS, LIMITS);

    expect(result.removed).toBe(2);
    expect(result.value).toBe(value);
    expect('adPlacements' in value).toBe(false);
    expect('playerAds' in value).toBe(false);
    expect(value['keep']).toBe(1);
  });

  it('removes ad keys nested inside objects', () => {
    const value = { a: { b: { adSlots: [], keep: true } } };
    const result = pruneJson(value, AD_KEYS, LIMITS);

    expect(result.removed).toBe(1);
    expect(result.value).toEqual({ a: { b: { keep: true } } });
  });

  it('removes ad keys inside arrays', () => {
    const value = { items: [{ adPlacements: [] }, { keep: 1 }] };
    const result = pruneJson(value, AD_KEYS, LIMITS);

    expect(result.removed).toBe(1);
    expect(result.value).toEqual({ items: [{}, { keep: 1 }] });
  });

  it('never removes a protected key, even when listed as an ad key', () => {
    const value: Record<string, unknown> = { videoDetails: { x: 1 }, adPlacements: [] };
    const result = pruneJson(value, ['videoDetails', 'adPlacements'], LIMITS);

    expect(result.removed).toBe(1);
    expect(result.value).toEqual({ videoDetails: { x: 1 } });
    expect(PROTECTED_KEYS).toContain('videoDetails');
    expect(PROTECTED_KEYS).toContain('streamingData');
  });

  it('reports overBudget when the member budget runs out', () => {
    const value = { a: { x: 1 }, b: { y: 2 } };
    const result = pruneJson(value, [], { maxDepth: 6, maxKeys: 1 });

    expect(result.overBudget).toBe(true);
    expect(result.removed).toBe(0);
  });

  it('does not descend past maxDepth', () => {
    const value = { l1: { l2: { adPlacements: [] } } };
    const result = pruneJson(value, AD_KEYS, { maxDepth: 1, maxKeys: 100 });

    expect(result.removed).toBe(0);
    expect(result.value).toEqual({ l1: { l2: { adPlacements: [] } } });
  });

  it('returns non-object values unchanged', () => {
    expect(pruneJson(42, AD_KEYS, LIMITS)).toEqual({ value: 42, removed: 0, overBudget: false });
    expect(pruneJson(null, AD_KEYS, LIMITS).removed).toBe(0);
    expect(pruneJson('text', AD_KEYS, LIMITS).removed).toBe(0);
    expect(pruneJson(undefined, AD_KEYS, LIMITS).removed).toBe(0);
  });

  it('never throws on a frozen object (fail-open, no change)', () => {
    const frozen = Object.freeze({ adPlacements: [] });

    expect(() => pruneJson(frozen, AD_KEYS, LIMITS)).not.toThrow();
    expect(pruneJson(frozen, AD_KEYS, LIMITS).removed).toBe(0);
  });
});
