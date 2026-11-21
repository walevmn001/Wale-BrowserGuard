import { describe, expect, it } from 'vitest';

import {
  convertFilterList,
  groupByCategory,
  MALWARE_WARNING_PAGE,
  summarize,
  type SkipReason,
} from '../../scripts/build-rules';
import { PRIORITY } from '../../src/shared/constants';

describe('convertFilterList — block rules', () => {
  const lines = [
    '||ads.example.com^',
    '||tracker.example.net^$third-party',
    '||cdn.example.org/banner.gif',
    '|http://example.com/ad.js',
    '/banner\\d+/',
    '||media.example.com^$image',
    '||example.com^$script,third-party',
    '||example.com^$~third-party',
    '||example.com^$xmlhttprequest',
    '||example.com^$~image',
  ];

  it('converts every supported line and skips none', () => {
    const result = convertFilterList(lines, 'ads');

    expect(result.rules).toHaveLength(10);
    expect(result.skipped).toHaveLength(0);
  });

  it('maps url/domain patterns to urlFilter verbatim', () => {
    const [first] = convertFilterList(lines, 'ads').rules;

    expect(first?.rule.condition.urlFilter).toBe('||ads.example.com^');
    expect(first?.rule.action.type).toBe('block');
    expect(first?.rule.priority).toBe(PRIORITY.BLOCK);
    expect(first?.rule.condition.domainType).toBeUndefined();
  });

  it('maps $third-party / $~third-party to domainType', () => {
    const rules = convertFilterList(lines, 'ads').rules;

    expect(rules[1]?.rule.condition.domainType).toBe('thirdParty');
    expect(rules[7]?.rule.condition.domainType).toBe('firstParty');
  });

  it('maps /regex/ to regexFilter without the slashes', () => {
    const regex = convertFilterList(lines, 'ads').rules[4];

    expect(regex?.rule.condition.regexFilter).toBe('banner\\d+');
    expect(regex?.rule.condition.urlFilter).toBeUndefined();
  });

  it('maps resource-type options and their negative form', () => {
    const rules = convertFilterList(lines, 'ads').rules;

    expect(rules[5]?.rule.condition.resourceTypes).toEqual(['image']);
    expect(rules[6]?.rule.condition.resourceTypes).toEqual(['script']);
    expect(rules[6]?.rule.condition.domainType).toBe('thirdParty');
    expect(rules[8]?.rule.condition.resourceTypes).toEqual(['xmlhttprequest']);
    expect(rules[9]?.rule.condition.excludedResourceTypes).toEqual(['image']);
  });
});

describe('convertFilterList — exceptions and priority', () => {
  it('turns @@ rules into allow rules at EXCEPTION_ALLOW priority', () => {
    const result = convertFilterList(
      ['@@||good.example.com^', '@@||example.com^$script', '@@|https://safe.example.com/'],
      'ads',
    );

    expect(result.rules).toHaveLength(3);
    for (const { rule } of result.rules) {
      expect(rule.action.type).toBe('allow');
      expect(rule.priority).toBe(PRIORITY.EXCEPTION_ALLOW);
    }
    expect(result.rules[0]?.rule.condition.urlFilter).toBe('||good.example.com^');
    expect(result.rules[1]?.rule.condition.resourceTypes).toEqual(['script']);
  });

  it('redirects a malware domain navigation and blocks its sub-resources', () => {
    const result = convertFilterList(['||malware.example^'], 'malware');

    expect(result.rules).toHaveLength(2);
    const [redirect, block] = result.rules;

    expect(redirect?.category).toBe('malware');
    expect(redirect?.rule.priority).toBe(PRIORITY.MALWARE_BLOCK);
    expect(redirect?.rule.action.type).toBe('redirect');
    expect(redirect?.rule.action.redirect?.extensionPath).toBe(MALWARE_WARNING_PAGE);
    expect(redirect?.rule.condition.resourceTypes).toEqual(['main_frame']);

    expect(block?.rule.action.type).toBe('block');
    expect(block?.rule.priority).toBe(PRIORITY.MALWARE_BLOCK);
    expect(block?.rule.condition.excludedResourceTypes).toEqual(['main_frame']);
  });

  it('leaves a resource-type-constrained malware line as a plain block', () => {
    const result = convertFilterList(['||malware.example^$script'], 'malware');

    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]?.rule.action.type).toBe('block');
    expect(result.rules[0]?.rule.condition.resourceTypes).toEqual(['script']);
  });

  it('assigns unique ids from startId', () => {
    const result = convertFilterList(['||a.example^', '||b.example^'], 'ads', 100);

    expect(result.rules.map(({ rule }) => rule.id)).toEqual([100, 101]);
  });
});

describe('convertFilterList — skipped lines are reported, never guessed', () => {
  const lines = [
    '',
    '! a comment',
    '[Adblock Plus 2.0]',
    'example.com##.ad-banner',
    'example.com#@#.ad',
    '||example.com^$popup',
    '||example.com^$domain=a.com',
    '||пример.com^',
    '$third-party',
    '||example.com^$script,~image',
  ];

  it('converts nothing and records a reason for each line', () => {
    const result = convertFilterList(lines, 'ads');

    expect(result.rules).toHaveLength(0);
    expect(result.skipped.map(({ reason }) => reason)).toEqual<SkipReason[]>([
      'empty',
      'comment',
      'comment',
      'cosmetic',
      'cosmetic',
      'unsupported-option',
      'unsupported-option',
      'unsupported-syntax',
      'unsupported-syntax',
      'unsupported-syntax',
    ]);
  });

  it('summarizes totals and per-reason counts', () => {
    expect(summarize(convertFilterList(lines, 'ads'))).toEqual({
      total: 10,
      converted: 0,
      skipped: 10,
      skippedByReason: {
        empty: 1,
        comment: 2,
        cosmetic: 2,
        'unsupported-option': 2,
        'unsupported-syntax': 3,
      },
    });
  });
});

describe('groupByCategory', () => {
  it('buckets rules into ads/trackers/malware/privacy', () => {
    const ads = convertFilterList(['||ads.example^'], 'ads').rules;
    const trackers = convertFilterList(['||track.example^'], 'trackers').rules;
    const malware = convertFilterList(['||malware.example^'], 'malware').rules;

    const grouped = groupByCategory([...ads, ...trackers, ...malware]);

    expect(grouped.ads).toHaveLength(1);
    expect(grouped.trackers).toHaveLength(1);
    // A bare malware domain expands to a redirect + a sub-resource block.
    expect(grouped.malware).toHaveLength(2);
    expect(grouped.privacy).toHaveLength(0);
    expect(grouped.ads[0]?.condition.urlFilter).toBe('||ads.example^');
  });
});
