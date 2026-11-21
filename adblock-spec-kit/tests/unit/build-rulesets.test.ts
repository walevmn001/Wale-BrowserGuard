import { describe, expect, it } from 'vitest';

import { buildStaticRuleSets } from '../../scripts/build-rulesets';
import { STATIC_RULESETS } from '../../scripts/static-rulesets';

const report = buildStaticRuleSets(process.cwd());

describe('buildStaticRuleSets', () => {
  it('builds one ruleset per descriptor, in order', () => {
    expect(report.ruleSets.map(({ descriptor }) => descriptor.id)).toEqual(
      STATIC_RULESETS.map(({ id }) => id),
    );
  });

  it('converts a non-empty set of rules and reports the skipped lines', () => {
    expect(report.totalRules).toBeGreaterThan(0);
    for (const ruleSet of report.ruleSets) {
      expect(ruleSet.rules.length).toBeGreaterThan(0);
    }
    expect(report.totalSkipped).toBeGreaterThan(0);
  });

  it('assigns globally unique, positive rule ids', () => {
    const ids = report.ruleSets.flatMap(({ rules }) => rules.map((rule) => rule.id));

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => Number.isInteger(id) && id >= 1)).toBe(true);
  });

  it('blocks the e2e fixture domain from ads.txt', () => {
    const ads = report.ruleSets.find(({ descriptor }) => descriptor.id === 'ads');
    const filters = ads?.rules.map((rule) => rule.condition.urlFilter);

    expect(filters).toContain('||ads.example.test^');
  });

  it('includes the code-generated privacy ruleset (upgrade + strip)', () => {
    const privacy = report.ruleSets.find(({ descriptor }) => descriptor.id === 'privacy');

    expect(privacy?.rules.some((rule) => rule.action.type === 'upgradeScheme')).toBe(true);
    expect(
      privacy?.rules.some(
        (rule) =>
          rule.action.type === 'redirect' &&
          (rule.action.redirect?.transform?.queryTransform?.removeParams?.length ?? 0) > 0,
      ),
    ).toBe(true);
    // Referer trimming is a dynamic rule now, so it is not in the static set.
    expect(privacy?.rules.some((rule) => rule.action.type === 'modifyHeaders')).toBe(false);
  });

  it('emits JSON that round-trips to the same rules', () => {
    for (const ruleSet of report.ruleSets) {
      expect(JSON.parse(ruleSet.json)).toEqual(ruleSet.rules);
    }
  });

  it('produces only converter-shaped conditions (urlFilter xor regexFilter)', () => {
    // The `privacy` ruleset is built in code, not converted from a filter list,
    // so its conditions (e.g. the referer rule's `domainType`) are out of scope.
    const converted = report.ruleSets.filter(({ descriptor }) => descriptor.id !== 'privacy');
    for (const { rules } of converted) {
      for (const rule of rules) {
        const hasUrl = rule.condition.urlFilter !== undefined;
        const hasRegex = rule.condition.regexFilter !== undefined;
        expect(hasUrl !== hasRegex).toBe(true);
      }
    }
  });
});

describe('trackers ruleset — B2 social / pixel / error hosts', () => {
  const trackers = report.ruleSets.find(({ descriptor }) => descriptor.id === 'trackers');
  const filters = new Set(
    (trackers?.rules ?? [])
      .map((rule) => rule.condition.urlFilter)
      .filter((filter): filter is string => filter !== undefined),
  );

  // A ~20-host sample covering the vendors the B2 list targets; every entry is
  // self-authored (MIT), not copied from any third-party list.
  const hosts = [
    'connect.facebook.net',
    'facebook.com/tr',
    'analytics.tiktok.com',
    'business-api.tiktok.com',
    'ct.pinterest.com',
    'log.pinterest.com',
    'analytics.twitter.com',
    'ads-twitter.com',
    'alb.reddit.com',
    'events.reddit.com',
    'sentry.io',
    'sentry-cdn.com',
    'luckyorange.com',
    'luckyorange.net',
    'analytics.yahoo.com',
    'geo.yahoo.com',
    'trc.taboola.com',
    'cdn.taboola.com',
    'taboola.com',
    'outbrain.com',
  ];

  it.each(hosts)('blocks ||%s^', (host) => {
    expect(filters.has(`||${host}^`)).toBe(true);
  });

  it('leaves every tracker rule unrestricted by resource type', () => {
    for (const rule of trackers?.rules ?? []) {
      expect(rule.condition.resourceTypes).toBeUndefined();
      expect(rule.action.type).toBe('block');
    }
  });
});
