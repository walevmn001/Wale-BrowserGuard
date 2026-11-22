import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ICON_SIZES,
  UI_ASSETS,
  iconManifestEntries,
  iconPath,
  readUiAsset,
} from '../../scripts/ui-assets';

// `tests/unit/` -> project root.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('UI_ASSETS', () => {
  it('copies the design tokens, the component stylesheet and the icon svg', () => {
    const destinations = UI_ASSETS.map((asset) => asset.to);

    expect(destinations).toContain('src/shared/ui/design-tokens.css');
    expect(destinations).toContain('src/shared/ui/components.css');
    expect(destinations).toContain('src/shared/ui/icon.svg');
  });

  it('copies one PNG icon per size', () => {
    for (const size of ICON_SIZES) {
      expect(UI_ASSETS.some((asset) => asset.to === iconPath(size))).toBe(true);
    }
  });

  it('ships the local Inter font subsets and their license', () => {
    const destinations = UI_ASSETS.map((asset) => asset.to);

    expect(destinations).toContain('src/shared/ui/fonts/inter-latin.woff2');
    expect(destinations).toContain('src/shared/ui/fonts/inter-vietnamese.woff2');
    expect(destinations).toContain('src/shared/ui/fonts/OFL.txt');
  });

  it('never emits two assets at the same destination', () => {
    const destinations = UI_ASSETS.map((asset) => asset.to);

    expect(new Set(destinations).size).toBe(destinations.length);
  });
});

describe('readUiAsset', () => {
  it('reads every declared asset from disk', () => {
    for (const asset of UI_ASSETS) {
      expect(readUiAsset(ROOT, asset).length).toBeGreaterThan(0);
    }
  });

  it('rasterises each PNG at the exact declared size', () => {
    for (const size of ICON_SIZES) {
      const asset = UI_ASSETS.find((candidate) => candidate.to === iconPath(size));
      expect(asset).toBeDefined();

      const png = readUiAsset(ROOT, asset!);

      expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      // IHDR width/height are big-endian 32-bit fields at byte offsets 16 and 20.
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
  });

  it('ships the mint tokens and the shared component classes', () => {
    const tokens = readUiAsset(ROOT, { from: 'src/shared/ui/design-tokens.css', to: '' });
    const components = readUiAsset(ROOT, { from: 'src/shared/ui/components.css', to: '' });

    expect(tokens.toString('utf8')).toContain('--mint-500');
    expect(tokens.toString('utf8')).toContain('font-family:"Inter"');
    expect(tokens.toString('utf8')).toContain('fonts/inter-vietnamese.woff2');
    expect(components.toString('utf8')).toContain('.switch');
  });
});

describe('iconManifestEntries', () => {
  it('maps every size to its emitted icon path', () => {
    expect(iconManifestEntries()).toEqual({
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    });
  });
});
