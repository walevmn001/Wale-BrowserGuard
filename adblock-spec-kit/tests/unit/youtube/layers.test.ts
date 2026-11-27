import { describe, expect, it } from 'vitest';

import { FLAG_NAMES } from '../../../src/youtube/config/flags';
import {
  ENGINE_LAYERS,
  ISOLATED_LAYERS,
  MAIN_LAYERS,
  isMainFlag,
} from '../../../src/youtube/config/layers';

describe('layer grouping', () => {
  it('exposes exactly the three MAIN-world hooks', () => {
    expect(MAIN_LAYERS.map((layer) => layer.flag)).toEqual([
      'ENABLE_JSON_PRUNER',
      'ENABLE_FETCH_HOOK',
      'ENABLE_XHR_HOOK',
    ]);
    expect(MAIN_LAYERS.every((layer) => layer.world === 'MAIN')).toBe(true);
  });

  it('exposes exactly the three ISOLATED-world layers', () => {
    expect(ISOLATED_LAYERS.map((layer) => layer.flag)).toEqual([
      'ENABLE_DNR',
      'ENABLE_RUNTIME_GUARD',
      'ENABLE_CSS_HIDER',
    ]);
    expect(ISOLATED_LAYERS.every((layer) => layer.world === 'ISOLATED')).toBe(true);
  });

  it('ENGINE_LAYERS is MAIN first then ISOLATED, with no duplicates', () => {
    expect(ENGINE_LAYERS).toEqual([...MAIN_LAYERS, ...ISOLATED_LAYERS]);
    const flags = ENGINE_LAYERS.map((layer) => layer.flag);
    expect(new Set(flags).size).toBe(flags.length);
  });

  it('groups only flags that actually exist', () => {
    const known = new Set<string>(FLAG_NAMES);
    for (const layer of ENGINE_LAYERS) {
      expect(known.has(layer.flag)).toBe(true);
    }
  });
});

describe('isMainFlag', () => {
  it('is true for the three MAIN flags and false otherwise', () => {
    expect(isMainFlag('ENABLE_JSON_PRUNER')).toBe(true);
    expect(isMainFlag('ENABLE_FETCH_HOOK')).toBe(true);
    expect(isMainFlag('ENABLE_XHR_HOOK')).toBe(true);

    for (const layer of ISOLATED_LAYERS) {
      expect(isMainFlag(layer.flag)).toBe(false);
    }
  });
});
