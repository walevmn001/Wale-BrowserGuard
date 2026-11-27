import { describe, expect, it } from 'vitest';

import {
  buildHideCss,
  hideSelectors,
  HIDE_SELECTOR_IDS,
  STYLE_ELEMENT_ID,
} from '../../../src/youtube/core/css-hider';

describe('buildHideCss', () => {
  it('returns an empty string when there is nothing to hide', () => {
    expect(buildHideCss([])).toBe('');
    expect(buildHideCss(['', '   '])).toBe('');
  });

  it('joins selectors into a single display:none rule', () => {
    expect(buildHideCss(['.ytp-ad-module', '.ytp-ad-overlay-container'])).toBe(
      '.ytp-ad-module,\n.ytp-ad-overlay-container { display: none !important; }',
    );
  });

  it('trims selectors and skips the blank ones', () => {
    expect(buildHideCss(['  .a  ', '', '  ', '.b'])).toBe('.a,\n.b { display: none !important; }');
  });
});

describe('hideSelectors', () => {
  it('resolves only the ad-chrome ids, skipping unknown or empty entries', () => {
    const registry = {
      get(name: string): string | undefined {
        const values: Record<string, string> = {
          AD_MODULE: ' .ytp-ad-module ',
          OVERLAY: '',
          PLAYER: '#movie_player',
        };
        return values[name];
      },
    };
    expect(hideSelectors(registry)).toEqual(['.ytp-ad-module']);
  });

  it('reads exactly the ids declared in HIDE_SELECTOR_IDS', () => {
    const seen: string[] = [];
    const registry = {
      get(name: string): string | undefined {
        seen.push(name);
        return `.${name.toLowerCase()}`;
      },
    };
    expect(hideSelectors(registry)).toEqual(['.ad_module', '.overlay']);
    expect(seen).toEqual([...HIDE_SELECTOR_IDS]);
  });
});

describe('stable identifiers', () => {
  it('keeps the expected hide ids and style element id', () => {
    expect(HIDE_SELECTOR_IDS).toEqual(['AD_MODULE', 'OVERLAY']);
    expect(STYLE_ELEMENT_ID).toBe('wg-youtube-hide-ads');
  });
});
