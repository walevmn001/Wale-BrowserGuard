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

  it('includes the code-generated privacy ruleset (https upgrade + tracking strip)', () => {
    const privacy = report.ruleSets.find(({ descriptor }) => descriptor.id === 'privacy');

    expect(privacy?.rules.some((rule) => rule.action.type === 'upgradeScheme')).toBe(true);
    expect(
      privacy?.rules.some(
        (rule) =>
          rule.action.type === 'redirect' &&
          (rule.action.redirect?.transform?.queryTransform?.removeParams?.length ?? 0) > 0,
      ),
    ).toBe(true);
  });

  it('emits JSON that round-trips to the same rules', () => {
    for (const ruleSet of report.ruleSets) {
      expect(JSON.parse(ruleSet.json)).toEqual(ruleSet.rules);
    }
  });

  it('produces only converter-shaped conditions (urlFilter xor regexFilter)', () => {
    for (const { rules } of report.ruleSets) {
      for (const rule of rules) {
        const hasUrl = rule.condition.urlFilter !== undefined;
        const hasRegex = rule.condition.regexFilter !== undefined;
        expect(hasUrl !== hasRegex).toBe(true);
      }
    }
  });
});
