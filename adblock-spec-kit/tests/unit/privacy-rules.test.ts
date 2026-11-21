import { describe, expect, it } from 'vitest';

import { buildPrivacyRules, UPGRADE_SCHEME_REGEX } from '../../scripts/privacy-rules';
import { PRIORITY } from '../../src/shared/constants';

describe('buildPrivacyRules', () => {
  const rules = buildPrivacyRules(42);

  it('emits one https upgradeScheme rule with the given id and priority', () => {
    expect(rules).toHaveLength(1);
    expect(rules[0]!.id).toBe(42);
    expect(rules[0]!.priority).toBe(PRIORITY.UPGRADE_SCHEME);
    expect(rules[0]!.action).toEqual({ type: 'upgradeScheme' });
  });

  it('only touches sub-resources, never navigations', () => {
    expect(rules[0]!.condition.excludedResourceTypes).toEqual(['main_frame', 'sub_frame']);
    expect(rules[0]!.condition.resourceTypes).toBeUndefined();
  });

  it('is outranked by the user whitelist, which is what makes a site an exception', () => {
    // algorithm.md §G asks for "domain trong danh sách ngoại lệ": a whitelisted
    // site is allowed by `allowAllRequests` before the upgrade rule is reached.
    expect(PRIORITY.WHITELIST_ALLOW_ALL).toBeGreaterThan(PRIORITY.UPGRADE_SCHEME);
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
