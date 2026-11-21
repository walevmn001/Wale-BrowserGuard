/**
 * Build step: turn the bundled ABP source lists into packaged DNR rulesets.
 *
 * Reads each source list described by `STATIC_RULESETS`, converts it with the
 * T010 converter, assigns globally-unique rule ids, then runs the T011
 * validator so an over-limit or malformed ruleset fails the build instead of
 * shipping a broken extension (algorithm.md §B steps 5-10).
 *
 * Pure and injectable (`repoRoot`) so it is unit-testable without touching the
 * real build; the Vite plugin calls it with `process.cwd()`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildCosmetic,
  serializeCosmetic,
  COSMETIC_OUTPUT,
  COSMETIC_SOURCE,
} from './build-cosmetic.ts';
import { convertFilterList } from './build-rules.ts';
import { STATIC_RULESETS, type StaticRuleSetDescriptor } from './static-rulesets.ts';
import { assertValidRules, type RuleSetInput } from './validate-rules.ts';

export interface BuiltRuleSet {
  readonly descriptor: StaticRuleSetDescriptor;
  readonly rules: readonly chrome.declarativeNetRequest.Rule[];
  readonly json: string;
  readonly skipped: number;
}

export interface BuildRulesetsReport {
  readonly ruleSets: readonly BuiltRuleSet[];
  readonly totalRules: number;
  readonly totalSkipped: number;
}

function readSourceLines(repoRoot: string, relativePath: string): readonly string[] {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8').split(/\r?\n/);
}

/** Converts every static source list and validates the result before packaging. */
export function buildStaticRuleSets(repoRoot: string): BuildRulesetsReport {
  const ruleSets: BuiltRuleSet[] = [];
  const forValidation: RuleSetInput[] = [];
  let nextId = 1;
  let totalSkipped = 0;

  for (const descriptor of STATIC_RULESETS) {
    const lines = readSourceLines(repoRoot, descriptor.source);
    const { rules, skipped } = convertFilterList(lines, descriptor.category, nextId);
    const plainRules = rules.map(({ rule }) => rule);

    nextId += plainRules.length;
    totalSkipped += skipped.length;

    ruleSets.push({
      descriptor,
      rules: plainRules,
      json: `${JSON.stringify(plainRules, null, 2)}\n`,
      skipped: skipped.length,
    });
    forValidation.push({ id: descriptor.id, enabled: descriptor.enabled, rules: plainRules });
  }

  assertValidRules({ ruleSets: forValidation });

  return { ruleSets, totalRules: nextId - 1, totalSkipped };
}

export interface BuiltCosmeticAsset {
  readonly path: string;
  readonly json: string;
}

export interface BuildCosmeticReport {
  readonly assets: readonly BuiltCosmeticAsset[];
  readonly genericSelectors: number;
  readonly domainSelectors: number;
  readonly domains: number;
  readonly skipped: number;
}

/**
 * Converts the bundled cosmetic source list into the two JSON assets the
 * content script loads at runtime (`rules/cosmetic/*.json`, plan.md §2).
 */
export function buildCosmeticAssets(repoRoot: string): BuildCosmeticReport {
  const lines = readSourceLines(repoRoot, COSMETIC_SOURCE);
  const { bundle, skipped } = buildCosmetic(lines);
  const json = serializeCosmetic(bundle);

  const domainSelectors = Object.values(bundle.domains).reduce(
    (total, entry) => total + entry.selectors.length,
    0,
  );

  return {
    assets: [
      { path: COSMETIC_OUTPUT.generic, json: json.generic },
      { path: COSMETIC_OUTPUT.domainSpecific, json: json.domainSpecific },
    ],
    genericSelectors: bundle.generic.selectors.length,
    domainSelectors,
    domains: Object.keys(bundle.domains).length,
    skipped: skipped.length,
  };
}
