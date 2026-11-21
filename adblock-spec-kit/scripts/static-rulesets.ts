/**
 * Descriptors for the *static* DNR rulesets that ship with the extension.
 *
 * One source of truth shared by the manifest (which declares the rulesets) and
 * the build (which converts the source lists and packages the JSON), so the two
 * can never drift apart (algorithm.md §B step 7).
 *
 * `source` is relative to the repo root; `output` is relative to the extension
 * root (i.e. `dist/`), which is what the manifest must reference.
 */

import type { RuleCategory } from './build-rules.ts';

export interface StaticRuleSetDescriptor {
  readonly id: string;
  readonly category: RuleCategory;
  readonly enabled: boolean;
  readonly source: string;
  readonly output: string;
}

export const STATIC_RULESETS: readonly StaticRuleSetDescriptor[] = [
  {
    id: 'ads',
    category: 'ads',
    enabled: true,
    source: 'rules/source/ads.txt',
    output: 'rules/static/ads.json',
  },
  {
    id: 'trackers',
    category: 'trackers',
    enabled: true,
    source: 'rules/source/trackers.txt',
    output: 'rules/static/trackers.json',
  },
];
