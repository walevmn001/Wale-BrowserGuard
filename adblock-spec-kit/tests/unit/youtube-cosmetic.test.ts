import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildYouTubeCosmeticAsset } from '../../scripts/youtube-cosmetic';
import { isCosmeticData, selectorsForHost } from '../../src/content/cosmetic';
import { YOUTUBE_COSMETIC_PATH } from '../../src/shared/youtube-config';

const SHIPPED: { selectors: string[] } = JSON.parse(
  readFileSync(new URL('../../data/youtube-config.json', import.meta.url), 'utf8'),
) as { selectors: string[] };

describe('buildYouTubeCosmeticAsset', () => {
  const asset = buildYouTubeCosmeticAsset(process.cwd());

  it('emits the configured output path', () => {
    expect(asset.path).toBe(YOUTUBE_COSMETIC_PATH);
    expect(asset.path).toBe('rules/cosmetic/youtube.json');
  });

  it('produces the cosmetic-data shape the runtime validates', () => {
    expect(isCosmeticData(JSON.parse(asset.json))).toBe(true);
  });

  it('scopes the selectors to the youtube.com family only', () => {
    const raw: unknown = JSON.parse(asset.json);
    if (!isCosmeticData(raw)) {
      throw new Error('asset is not valid cosmetic data');
    }

    expect(selectorsForHost('www.youtube.com', raw)).toEqual(SHIPPED.selectors);
    expect(selectorsForHost('m.youtube.com', raw)).toEqual(SHIPPED.selectors);
    expect(selectorsForHost('example.org', raw)).toEqual([]);
  });

  it('carries every selector from the shipped config (data, not code)', () => {
    expect(asset.selectors).toBe(SHIPPED.selectors.length);
    for (const selector of SHIPPED.selectors) {
      expect(asset.json).toContain(selector);
    }
  });

  it('ends with a newline, matching the other build assets', () => {
    expect(asset.json.endsWith('\n')).toBe(true);
  });
});
