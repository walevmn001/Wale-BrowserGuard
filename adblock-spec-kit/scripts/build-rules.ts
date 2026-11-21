/**
 * Minimal Adblock Plus filter-list -> declarativeNetRequest converter.
 *
 * Scope is the P1 subset from specs/001-adblock-security/plan.md §6: basic
 * URL/domain patterns, `/regex/`, `@@` exceptions, and the `$` options
 * `third-party`, `script`, `image`, `xmlhttprequest` plus `~` negation.
 *
 * DNR `urlFilter` tokens (`*`, `|`, `||`, `^`) have the same meaning as ABP's,
 * so a supported pattern is copied through verbatim (verified against
 * developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest,
 * "URL filter syntax"). Everything outside the supported subset is skipped on
 * purpose and surfaced in the report instead of guessed at.
 *
 * This module only turns lines into typed DNR rules; declaring the static
 * rulesets and packaging the JSON is a later task (T012).
 */

import { EXTENSION_ID } from './extension-key.ts';
import { PRIORITY } from '../src/shared/constants.ts';

export type RuleCategory = 'ads' | 'trackers' | 'malware' | 'privacy';

export type SkipReason =
  'empty' | 'comment' | 'cosmetic' | 'unsupported-option' | 'unsupported-syntax';

export interface ConvertedRule {
  readonly category: RuleCategory;
  readonly rule: chrome.declarativeNetRequest.Rule;
}

export interface SkippedLine {
  readonly line: string;
  readonly reason: SkipReason;
}

export interface ConversionResult {
  readonly rules: readonly ConvertedRule[];
  readonly skipped: readonly SkippedLine[];
}

export interface RulesByCategory {
  readonly ads: chrome.declarativeNetRequest.Rule[];
  readonly trackers: chrome.declarativeNetRequest.Rule[];
  readonly malware: chrome.declarativeNetRequest.Rule[];
  readonly privacy: chrome.declarativeNetRequest.Rule[];
}

export interface ConversionSummary {
  readonly total: number;
  readonly converted: number;
  readonly skipped: number;
  readonly skippedByReason: Readonly<Record<SkipReason, number>>;
}

type DnrResourceType = `${chrome.declarativeNetRequest.ResourceType}`;
type DnrDomainType = `${chrome.declarativeNetRequest.DomainType}`;

interface NetworkLine {
  readonly isException: boolean;
  readonly address: string;
  readonly options: readonly string[];
}

type ParseOutcome =
  | { readonly kind: 'network'; readonly line: NetworkLine }
  | { readonly kind: 'skip'; readonly reason: SkipReason };

type ConditionOutcome =
  | { readonly kind: 'ok'; readonly condition: chrome.declarativeNetRequest.RuleCondition }
  | { readonly kind: 'error'; readonly reason: SkipReason };

type LineOutcome =
  | { readonly kind: 'rules'; readonly rules: readonly chrome.declarativeNetRequest.Rule[] }
  | { readonly kind: 'skip'; readonly reason: SkipReason };

/**
 * Redirect target for a blocked top-level navigation to a malware domain
 * (algorithm.md §F). A path relative to the extension root; the matching file
 * is emitted by the build from `src/warning/warning.html`.
 */
export const MALWARE_WARNING_PAGE = '/src/warning/warning.html';

/**
 * Prefix of the warning-page redirect URL. A DNR `regexSubstitution` has to
 * resolve to an absolute URL, so the extension id — fixed by the manifest
 * `key` (T031) — is baked in here; the captured original URL is appended as the
 * fragment so the warning page knows what it stopped.
 */
export const WARNING_REDIRECT_PREFIX = `chrome-extension://${EXTENSION_ID}${MALWARE_WARNING_PAGE}#`;

/** Captures the whole navigation URL (minus any fragment) as group 1. */
const FULL_URL_REGEX = '^(https?://[^#]*)';

/** Matches a bare-domain malware line such as `||host^`. */
const BARE_DOMAIN = /^\|\|([a-z0-9.-]+)\^$/i;

/** `urlFilter` only accepts printable ASCII (use punycode for other hosts). */
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

function isComment(line: string): boolean {
  return line.startsWith('!') || (line.startsWith('[') && line.endsWith(']'));
}

function isCosmetic(line: string): boolean {
  return line.includes('##') || line.includes('#@#') || line.includes('#?#');
}

function parseOptions(raw: string): readonly string[] {
  const options = raw.startsWith('$') ? raw.slice(1) : raw;
  if (options === '') {
    return [];
  }
  return options
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option !== '');
}

function splitAddressAndOptions(body: string): {
  readonly address: string;
  readonly options: readonly string[];
} {
  const regexClose = body.startsWith('/') ? body.indexOf('/', 1) : -1;
  if (regexClose > 0) {
    return {
      address: body.slice(0, regexClose + 1),
      options: parseOptions(body.slice(regexClose + 1)),
    };
  }
  const dollar = body.indexOf('$');
  if (dollar < 0) {
    return { address: body, options: [] };
  }
  return { address: body.slice(0, dollar), options: parseOptions(body.slice(dollar)) };
}

function parseLine(rawLine: string): ParseOutcome {
  const line = rawLine.trim();
  if (line === '') {
    return { kind: 'skip', reason: 'empty' };
  }
  if (isComment(line)) {
    return { kind: 'skip', reason: 'comment' };
  }
  if (isCosmetic(line)) {
    return { kind: 'skip', reason: 'cosmetic' };
  }
  const isException = line.startsWith('@@');
  const split = splitAddressAndOptions(isException ? line.slice(2) : line);
  if (split.address === '') {
    return { kind: 'skip', reason: 'unsupported-syntax' };
  }
  return {
    kind: 'network',
    line: { isException, address: split.address, options: split.options },
  };
}

function toResourceType(name: string): DnrResourceType | undefined {
  switch (name) {
    case 'script':
      return 'script';
    case 'image':
      return 'image';
    case 'xmlhttprequest':
      return 'xmlhttprequest';
    default:
      return undefined;
  }
}

function isRegexAddress(address: string): boolean {
  return address.length > 2 && address.startsWith('/') && address.endsWith('/');
}

function buildCondition(line: NetworkLine): ConditionOutcome {
  const included: DnrResourceType[] = [];
  const excluded: DnrResourceType[] = [];
  let domainType: DnrDomainType | undefined;

  for (const option of line.options) {
    const negated = option.startsWith('~');
    const name = negated ? option.slice(1) : option;
    if (name === 'third-party') {
      domainType = negated ? 'firstParty' : 'thirdParty';
      continue;
    }
    const resourceType = toResourceType(name);
    if (resourceType === undefined) {
      return { kind: 'error', reason: 'unsupported-option' };
    }
    if (negated) {
      excluded.push(resourceType);
    } else {
      included.push(resourceType);
    }
  }

  if (included.length > 0 && excluded.length > 0) {
    return { kind: 'error', reason: 'unsupported-syntax' };
  }

  const condition: chrome.declarativeNetRequest.RuleCondition = {};
  if (isRegexAddress(line.address)) {
    const pattern = line.address.slice(1, -1);
    if (pattern === '') {
      return { kind: 'error', reason: 'unsupported-syntax' };
    }
    condition.regexFilter = pattern;
  } else {
    if (!PRINTABLE_ASCII.test(line.address)) {
      return { kind: 'error', reason: 'unsupported-syntax' };
    }
    condition.urlFilter = line.address;
  }

  if (domainType !== undefined) {
    condition.domainType = domainType;
  }
  if (included.length > 0) {
    condition.resourceTypes = included;
  }
  if (excluded.length > 0) {
    condition.excludedResourceTypes = excluded;
  }
  return { kind: 'ok', condition };
}

function priorityFor(line: NetworkLine, category: RuleCategory): number {
  if (line.isException) {
    return PRIORITY.EXCEPTION_ALLOW;
  }
  if (category === 'malware') {
    return PRIORITY.MALWARE_BLOCK;
  }
  return PRIORITY.BLOCK;
}

/** A condition with no extra constraints beyond the bare-domain `urlFilter`. */
function isPlainDomainCondition(condition: chrome.declarativeNetRequest.RuleCondition): boolean {
  return condition.urlFilter !== undefined && Object.keys(condition).length === 1;
}

/**
 * Builds the rules for one malware-category line (algorithm.md §F).
 *
 * A bare domain gets two rules at {@link PRIORITY.MALWARE_BLOCK}: the top-level
 * navigation is redirected to the warning page — with the blocked URL in the
 * fragment — so the user sees an explanation and can opt into a temporary pass,
 * and the domain's sub-resource loads are blocked. Blocking sub-resources while
 * redirecting the document is the only way to get both from DNR, since a higher
 * `block` would otherwise win over the `redirect` for the same request.
 *
 * Lines the converter turned into anything but a plain domain pattern (a
 * resource type, a negation, a regex…) are left as a plain block, so a targeted
 * line is never broadened into a whole-document redirect.
 */
function malwareRules(
  condition: chrome.declarativeNetRequest.RuleCondition,
  address: string,
  id: number,
): readonly chrome.declarativeNetRequest.Rule[] {
  const domain = BARE_DOMAIN.exec(address)?.[1];
  if (domain === undefined || !isPlainDomainCondition(condition)) {
    return [{ id, priority: PRIORITY.MALWARE_BLOCK, action: { type: 'block' }, condition }];
  }
  return [
    {
      id,
      priority: PRIORITY.MALWARE_BLOCK,
      action: {
        type: 'redirect',
        redirect: { regexSubstitution: `${WARNING_REDIRECT_PREFIX}\\1` },
      },
      condition: {
        requestDomains: [domain],
        regexFilter: FULL_URL_REGEX,
        resourceTypes: ['main_frame'],
      },
    },
    {
      id: id + 1,
      priority: PRIORITY.MALWARE_BLOCK,
      action: { type: 'block' },
      condition: { ...condition, excludedResourceTypes: ['main_frame'] },
    },
  ];
}

function convertLine(rawLine: string, id: number, category: RuleCategory): LineOutcome {
  const parsed = parseLine(rawLine);
  if (parsed.kind === 'skip') {
    return parsed;
  }
  const condition = buildCondition(parsed.line);
  if (condition.kind === 'error') {
    return { kind: 'skip', reason: condition.reason };
  }
  if (category === 'malware' && !parsed.line.isException) {
    return { kind: 'rules', rules: malwareRules(condition.condition, parsed.line.address, id) };
  }
  return {
    kind: 'rules',
    rules: [
      {
        id,
        priority: priorityFor(parsed.line, category),
        action: { type: parsed.line.isException ? 'allow' : 'block' },
        condition: condition.condition,
      },
    ],
  };
}

/**
 * Converts a filter list into DNR rules tagged with their category.
 *
 * `startId` keeps ids unique when several lists are concatenated into one
 * ruleset (DNR requires ids to be unique and >= 1).
 */
export function convertFilterList(
  lines: readonly string[],
  category: RuleCategory,
  startId = 1,
): ConversionResult {
  const rules: ConvertedRule[] = [];
  const skipped: SkippedLine[] = [];
  let nextId = startId;

  for (const line of lines) {
    const outcome = convertLine(line, nextId, category);
    if (outcome.kind === 'rules') {
      for (const rule of outcome.rules) {
        rules.push({ category, rule });
        nextId += 1;
      }
    } else {
      skipped.push({ line: line.trim(), reason: outcome.reason });
    }
  }
  return { rules, skipped };
}

/** Splits converted rules into the per-category buckets used by the rulesets. */
export function groupByCategory(rules: readonly ConvertedRule[]): RulesByCategory {
  const grouped: RulesByCategory = { ads: [], trackers: [], malware: [], privacy: [] };
  for (const { category, rule } of rules) {
    grouped[category].push(rule);
  }
  return grouped;
}

/** Build-time report: how many lines converted and why the rest were skipped. */
export function summarize(result: ConversionResult): ConversionSummary {
  const skippedByReason: Record<SkipReason, number> = {
    empty: 0,
    comment: 0,
    cosmetic: 0,
    'unsupported-option': 0,
    'unsupported-syntax': 0,
  };
  for (const { reason } of result.skipped) {
    skippedByReason[reason] += 1;
  }
  return {
    total: result.rules.length + result.skipped.length,
    converted: result.rules.length,
    skipped: result.skipped.length,
    skippedByReason,
  };
}
