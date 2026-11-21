import { describe, expect, it } from 'vitest';

import { buildStaticRuleSets } from '../../scripts/build-rulesets';
import { STATIC_RULESETS } from '../../scripts/static-rulesets';
import { RULE_LIMITS, validateRules } from '../../scripts/validate-rules';

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

describe('ads ruleset — B4 ad-script path rules', () => {
  const ads = report.ruleSets.find(({ descriptor }) => descriptor.id === 'ads');
  const byFilter = new Map(
    (ads?.rules ?? [])
      .filter((rule) => rule.condition.urlFilter !== undefined)
      .map((rule) => [rule.condition.urlFilter, rule]),
  );

  // Path-anchored patterns (no `||host`), so the same `ads.js`/`pagead.js` is
  // blocked no matter which host serves it. B1 taught the converter to keep a
  // `/path` body a urlFilter instead of mistaking it for a `/regex/`.
  it.each(['/ads.js', '/pagead.js'])('blocks any path %s as a script', (filter) => {
    const rule = byFilter.get(filter);

    expect(rule?.action.type).toBe('block');
    expect(rule?.condition.resourceTypes).toEqual(['script']);
  });
});

/**
 * B2b-1 generic subdomain-prefix rules.
 *
 * `||<prefix>.` anchors a leading host label, so the same prefix blocks
 * `<prefix>.<anything>` across vendors instead of enumerating every host. The
 * trailing dot and `$third-party` keep them narrow: `||ads.` cannot match the
 * unrelated `https://ads.example.company` (see the DNR "Write good URL
 * conditions" guidance) and first-party requests are left alone. With no
 * `resourceTypes` the rules never match `main_frame`, so the vendor's own site
 * still opens (T033).
 *
 * The prefixes are public ad/measurement conventions, self-authored for this
 * project (MIT — see rules/README.md); none are copied from a third-party list.
 */
describe('rulesets — B2b-1 generic subdomain prefixes', () => {
  const rulesOf = (id: string): readonly chrome.declarativeNetRequest.Rule[] =>
    report.ruleSets.find(({ descriptor }) => descriptor.id === id)?.rules ?? [];

  const ruleFor = (
    id: string,
    filter: string,
  ): chrome.declarativeNetRequest.Rule | undefined =>
    rulesOf(id).find((rule) => rule.condition.urlFilter === filter);

  // Ad-side prefixes live in ads.txt; measurement prefixes in trackers.txt.
  const adPrefixes = ['ads', 'ad', 'adserver', 'adx'];
  const measurePrefixes = [
    'analytics',
    'metrics',
    'telemetry',
    'tracking',
    'tracker',
    'pixel',
    'trk',
    'events',
    'stats',
    'beacon',
  ];

  const cases = [
    ...adPrefixes.map((prefix) => ['ads', prefix] as const),
    ...measurePrefixes.map((prefix) => ['trackers', prefix] as const),
  ];

  it.each(cases)('%s anchors ||%s. as a third-party, sub-resource-only block', (id, prefix) => {
    const rule = ruleFor(id, `||${prefix}.`);

    expect(rule?.action.type).toBe('block');
    expect(rule?.condition.domainType).toBe('thirdParty');
    // No resourceTypes => not applied to main_frame; only sub-resources.
    expect(rule?.condition.resourceTypes).toBeUndefined();
  });

  it('always keeps the trailing dot so the anchor stays on a label boundary', () => {
    for (const id of ['ads', 'trackers']) {
      const filters = new Set(rulesOf(id).map((rule) => rule.condition.urlFilter));
      for (const [, prefix] of cases) {
        // A bare `||ads` would also match `https://ads.example.company`.
        expect(filters.has(`||${prefix}`)).toBe(false);
      }
    }
  });
});

/**
 * B2b-2 vendor tracking / ad endpoints.
 *
 * B2b-1 only covers the *generic* `<prefix>.` convention, so a host like
 * `an.yandex.ru` (whose first label is not a known ad/measurement word) slips
 * through. These are the vendor-specific ad-server and Social / measurement
 * endpoints, addressed by their own hostname. Like every block rule here they
 * are domain-anchored and set no `resourceTypes`, so they never match
 * `main_frame` — the vendor's own site still opens (T033). Names are public
 * vendor endpoints, self-authored for this project (MIT — see rules/README.md),
 * not copied from any third-party list.
 */
describe('rulesets — B2b-2 vendor tracking hosts', () => {
  const rulesOf = (id: string): readonly chrome.declarativeNetRequest.Rule[] =>
    report.ruleSets.find(({ descriptor }) => descriptor.id === id)?.rules ?? [];

  // Ad-serving endpoints live in ads.txt; Social / measurement in trackers.txt.
  const adVendors = [
    'an.yandex.ru',
    'adfox.yandex.ru',
    'adfstat.yandex.ru',
    'bat.bing.com',
    'gemini.yahoo.com',
  ];
  const trackerVendors = [
    'mc.yandex.ru',
    'an.facebook.com',
    'udc.yahoo.com',
    'pixel.reddit.com',
    'tr.snapchat.com',
    'px.ads.linkedin.com',
  ];

  const cases = [
    ...adVendors.map((host) => ['ads', host] as const),
    ...trackerVendors.map((host) => ['trackers', host] as const),
  ];

  it.each(cases)('%s blocks ||%s^ as a sub-resource-only rule', (id, host) => {
    const rule = rulesOf(id).find((entry) => entry.condition.urlFilter === `||${host}^`);

    expect(rule?.action.type).toBe('block');
    // No resourceTypes => sub-resources only; the vendor's own page still opens.
    expect(rule?.condition.resourceTypes).toBeUndefined();
  });
});

/**
 * B2b-3: the packaged rulesets (including every B2b-1/B2b-2 rule) must satisfy
 * the build-time DNR validator and stay inside the documented limits. The build
 * already calls `assertValidRules`, so this pins the *shape* of the shipped set:
 * a regression that pushes a limit over budget fails here as well as at build.
 */
describe('validate-rules — the packaged rulesets (B2b-3)', () => {
  const packaged = validateRules({
    ruleSets: report.ruleSets.map(({ descriptor, rules }) => ({
      id: descriptor.id,
      enabled: descriptor.enabled,
      rules,
    })),
  });

  it('accepts the real rulesets with no errors', () => {
    expect(packaged.ok).toBe(true);
    expect(packaged.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('stays inside the static-rule budget and regex limit', () => {
    expect(packaged.stats.enabledRuleSets).toBeLessThanOrEqual(RULE_LIMITS.MAX_ENABLED_RULESETS);
    expect(packaged.stats.enabledRules).toBeLessThanOrEqual(RULE_LIMITS.STATIC_RULE_BUDGET);
    expect(packaged.stats.enabledRegexRules).toBeLessThanOrEqual(RULE_LIMITS.MAX_REGEX_RULES);
  });

  it('counts every shipped ruleset and rule', () => {
    expect(packaged.stats.ruleSets).toBe(STATIC_RULESETS.length);
    expect(packaged.stats.enabledRules).toBe(report.totalRules);
  });
});

