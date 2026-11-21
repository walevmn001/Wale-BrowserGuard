import { describe, expect, it } from 'vitest';

import {
  ALL_RESOURCE_TYPES,
  buildPrivacyRules,
  TRACKING_PARAMS,
  TRACKING_QUERY_REGEX,
  UPGRADE_SCHEME_REGEX,
  UTM_PARAMS,
} from '../../scripts/privacy-rules';
import { PRIORITY } from '../../src/shared/constants';

describe('buildPrivacyRules', () => {
  const rules = buildPrivacyRules(42);
  const upgrade = rules[0]!;
  const strip = rules[1]!;

  it('emits the https upgrade and the tracking-parameter strip, with sequential ids', () => {
    expect(rules).toHaveLength(2);
    expect(upgrade.id).toBe(42);
    expect(strip.id).toBe(43);
  });

  it('upgrades insecure sub-resources at the upgrade priority', () => {
    expect(upgrade.priority).toBe(PRIORITY.UPGRADE_SCHEME);
    expect(upgrade.action).toEqual({ type: 'upgradeScheme' });
    expect(upgrade.condition.excludedResourceTypes).toEqual(['main_frame', 'sub_frame']);
    expect(upgrade.condition.resourceTypes).toBeUndefined();
  });

  it('strips tracking parameters at the removeparam priority', () => {
    expect(strip.priority).toBe(PRIORITY.REMOVE_PARAM);
    expect(strip.action.type).toBe('redirect');
    expect(strip.action.redirect?.transform?.queryTransform?.removeParams).toEqual([
      ...TRACKING_PARAMS,
    ]);
  });

  it('uses a cheap query-string prefilter as the strip condition', () => {
    // The exact key list cannot be spelled out in RE2 (memoryLimitExceeded), so
    // `removeParams` does the matching and the condition only gates on a query.
    expect(strip.condition.regexFilter).toBe(TRACKING_QUERY_REGEX);
    expect(strip.condition.urlFilter).toBeUndefined();
  });

  it('matches navigations as well as sub-resources, so the strip covers both', () => {
    // A rule that omits `resourceTypes` never matches main_frame in DNR, so the
    // strip would miss the address bar; the explicit list is what fixes that.
    expect(strip.condition.resourceTypes).toEqual([...ALL_RESOURCE_TYPES]);
    expect(strip.condition.resourceTypes).toContain('main_frame');
    expect(strip.condition.resourceTypes).toContain('image');
  });

  it('is outranked by the user whitelist, which is what makes a site an exception', () => {
    // algorithm.md §G asks for "domain trong danh sách ngoại lệ": a whitelisted
    // site is allowed by `allowAllRequests` before the privacy rules are reached.
    expect(PRIORITY.WHITELIST_ALLOW_ALL).toBeGreaterThan(PRIORITY.UPGRADE_SCHEME);
    expect(PRIORITY.WHITELIST_ALLOW_ALL).toBeGreaterThan(PRIORITY.REMOVE_PARAM);
  });

  it('keeps the strip below every blocking rule so a blocked request stays blocked', () => {
    expect(PRIORITY.REMOVE_PARAM).toBeLessThan(PRIORITY.BLOCK);
    expect(PRIORITY.REMOVE_PARAM).toBeLessThan(PRIORITY.MALWARE_BLOCK);
  });
});

describe('the https-upgrade filter', () => {
  // Chromium runs `regexFilter` as an RE2 pattern; a plain RegExp with the same
  // source is a faithful stand-in for the match/no-match decision.
  const matches = (url: string): boolean => new RegExp(UPGRADE_SCHEME_REGEX).test(url);

  it('matches an insecure request to a public domain', () => {
    expect(matches('http://upgrade.example.test:8080/px.png')).toBe(true);
    expect(matches('http://example.com/')).toBe(true);
    expect(matches('http://a.b.co.uk/pixel')).toBe(true);
  });

  it('never matches an already-secure URL, so an upgraded request cannot loop', () => {
    expect(matches('https://example.com/')).toBe(false);
    expect(matches('https://upgrade.example.test:8080/px.png')).toBe(false);
  });

  it('leaves localhost and IP literals alone', () => {
    expect(matches('http://localhost/')).toBe(false);
    expect(matches('http://localhost:8080/x.js')).toBe(false);
    expect(matches('http://127.0.0.1/x')).toBe(false);
    expect(matches('http://10.0.0.5/x')).toBe(false);
    expect(matches('http://192.168.1.1:8080/x')).toBe(false);
    expect(matches('http://[::1]:8080/x')).toBe(false);
  });
});

describe('the tracking-parameter list', () => {
  it('covers the utm_* family plus the classic click ids from algorithm.md §G', () => {
    expect(UTM_PARAMS.every((param) => param.startsWith('utm_'))).toBe(true);
    for (const param of ['utm_source', 'utm_medium', 'utm_campaign']) {
      expect(TRACKING_PARAMS).toContain(param);
    }
    for (const param of ['fbclid', 'gclid', 'mc_eid']) {
      expect(TRACKING_PARAMS).toContain(param);
    }
  });

  it('has no duplicates and only ASCII keys', () => {
    expect(new Set(TRACKING_PARAMS).size).toBe(TRACKING_PARAMS.length);
    expect(TRACKING_PARAMS.every((param) => /^[\x21-\x7e]+$/.test(param))).toBe(true);
  });

  it('starts every key with a letter or underscore, so a key is never a bare number', () => {
    expect(TRACKING_PARAMS.every((param) => /^[a-z_][a-z0-9_]*$/.test(param))).toBe(true);
  });
});

describe('the tracking-parameter prefilter', () => {
  const matches = (url: string): boolean => new RegExp(TRACKING_QUERY_REGEX).test(url);

  it('matches any URL that carries a query string', () => {
    expect(matches('https://shop.example.test/p?utm_source=news&id=7')).toBe(true);
    expect(matches('https://shop.example.test/p?id=7')).toBe(true);
    expect(matches('https://shop.example.test/p?fbclid=IwAR')).toBe(true);
  });

  it('does not match a URL without a query, so the rule is never computed for it', () => {
    expect(matches('https://shop.example.test/p')).toBe(false);
  });
});
