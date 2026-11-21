import { describe, expect, it } from 'vitest';

import {
  buildCosmetic,
  serializeCosmetic,
  COSMETIC_OUTPUT,
  type CosmeticSkipReason,
} from '../../scripts/build-cosmetic';
import { buildCosmeticAssets } from '../../scripts/build-rulesets';

describe('buildCosmetic — parsing', () => {
  it('parses a generic hide rule', () => {
    const { bundle } = buildCosmetic(['##.ad-banner']);

    expect(bundle.generic.selectors).toEqual(['.ad-banner']);
    expect(bundle.generic.exceptions).toEqual([]);
    expect(bundle.domains).toEqual({});
  });

  it('parses domain-scoped hide rules, one entry per domain', () => {
    const { bundle } = buildCosmetic(['example.org,news.example##.promo-box']);

    expect(bundle.generic.selectors).toEqual([]);
    expect(bundle.domains).toEqual({
      'example.org': { selectors: ['.promo-box'], exceptions: [] },
      'news.example': { selectors: ['.promo-box'], exceptions: [] },
    });
  });

  it('lower-cases domain tokens and keeps the selector verbatim', () => {
    const { bundle } = buildCosmetic(['Example.ORG##div#Ad-Slot']);

    expect(bundle.domains['example.org']?.selectors).toEqual(['div#Ad-Slot']);
  });

  it('parses generic and domain-specific exceptions', () => {
    const { bundle } = buildCosmetic(['#@#.ad', 'example.org#@#.ad']);

    expect(bundle.generic.exceptions).toEqual(['.ad']);
    expect(bundle.domains['example.org']?.exceptions).toEqual(['.ad']);
  });
});

describe('buildCosmetic — skipped lines are reported, never guessed', () => {
  const reasons = (lines: readonly string[]): CosmeticSkipReason[] =>
    buildCosmetic(lines).skipped.map(({ reason }) => reason);

  it('records a reason for blank lines and comments', () => {
    expect(reasons(['', '   ', '! a comment', '[Adblock Plus 2.0]'])).toEqual([
      'empty',
      'empty',
      'comment',
      'comment',
    ]);
  });

  it('skips extended/procedural rules it cannot express', () => {
    expect(reasons(['example.org#?#div:has(> .ad)', '##div:has-text(Sponsored)'])).toEqual([
      'unsupported',
      'unsupported',
    ]);
  });

  it('skips ~-exclusion domains and malformed domain tokens', () => {
    expect(reasons(['~example.org##.ad', 'exa*mple.org##.ad'])).toEqual([
      'unsupported',
      'unsupported',
    ]);
  });

  it('rejects too-broad selectors (`*` and bare tags)', () => {
    expect(reasons(['##*', '##div', '##a', '##SPAN'])).toEqual([
      'too-broad',
      'too-broad',
      'too-broad',
      'too-broad',
    ]);
  });

  it('accepts narrow selectors that merely start with a tag name', () => {
    const { bundle, skipped } = buildCosmetic(['##div.ad-slot', '##a[data-ad]']);

    expect(skipped).toEqual([]);
    expect(bundle.generic.selectors).toEqual(['div.ad-slot', 'a[data-ad]']);
  });

  it('skips a rule whose selector is empty', () => {
    expect(reasons(['example.org##', '##'])).toEqual(['unsupported', 'unsupported']);
  });
});

describe('buildCosmetic — output shape', () => {
  it('dedupes selectors while keeping first-seen order', () => {
    const { bundle } = buildCosmetic(['##.ad', '##.ad', '##.banner']);

    expect(bundle.generic.selectors).toEqual(['.ad', '.banner']);
  });

  it('sorts domains for a stable output', () => {
    const { bundle } = buildCosmetic(['z.example##.z', 'a.example##.a', 'm.example##.m']);

    expect(Object.keys(bundle.domains)).toEqual(['a.example', 'm.example', 'z.example']);
  });

  it('serializes both bundles as round-trippable JSON with a trailing newline', () => {
    const { bundle } = buildCosmetic(['##.ad', 'example.org##.promo']);
    const json = serializeCosmetic(bundle);

    expect(json.generic.endsWith('\n')).toBe(true);
    expect(json.domainSpecific.endsWith('\n')).toBe(true);
    expect(JSON.parse(json.generic)).toEqual(bundle.generic);
    expect(JSON.parse(json.domainSpecific)).toEqual(bundle.domains);
  });
});

describe('buildCosmeticAssets — bundled cosmetic source list', () => {
  const report = buildCosmeticAssets(process.cwd());
  const generic = JSON.parse(
    report.assets.find(({ path }) => path === COSMETIC_OUTPUT.generic)?.json ?? '{}',
  ) as { selectors: string[] };
  const domains = JSON.parse(
    report.assets.find(({ path }) => path === COSMETIC_OUTPUT.domainSpecific)?.json ?? '{}',
  ) as Record<string, { selectors: string[]; exceptions: string[] }>;

  it('emits exactly the generic + domain-specific assets', () => {
    expect(report.assets.map(({ path }) => path)).toEqual([
      COSMETIC_OUTPUT.generic,
      COSMETIC_OUTPUT.domainSpecific,
    ]);
  });

  it('carries a non-empty generic selector set', () => {
    expect(report.genericSelectors).toBeGreaterThan(0);
    expect(generic.selectors).toContain('.ad-banner');
  });

  it('carries the example.org domain override and its #@# exception', () => {
    expect(report.domains).toBeGreaterThan(0);
    expect(domains['example.org']?.selectors).toEqual(['.promo-box']);
    expect(domains['example.org']?.exceptions).toEqual(['.ad-banner']);
  });

  it('never emits a selector the content script would reject', () => {
    for (const selector of generic.selectors) {
      expect(selector).not.toBe('*');
      expect(selector).not.toMatch(/^[a-z][a-z0-9]*$/i);
    }
  });
});
