/**
 * Minimal Adblock Plus *cosmetic* filter -> element-hiding JSON converter (T020).
 *
 * Scope is the cosmetic subset from algorithm.md §D and plan.md §3:
 *   - `##selector`                  generic hide
 *   - `domain[,domain]##selector`   domain-scoped hide
 *   - `#@#selector` / `domain#@#…`  exceptions
 *
 * Procedural / extended rules (`#?#`, `#$#`, `#%#`) and `~`-exclusion domains are
 * out of scope: they are skipped and surfaced in the report instead of guessed
 * at, matching the conservative "chặn thiếu" policy. Overly broad selectors
 * (`*`, bare tags such as `div`/`a`) are rejected so the build can never hide a
 * whole page (algorithm.md §D constraint).
 *
 * The output is two JSON blobs (`generic` + `domain-specific`) consumed at
 * runtime by the content script (T021): for a host `h`, the injected set is
 * `generic.selectors ∪ domain[h].selectors − generic.exceptions − domain[h].exceptions`.
 */

export type CosmeticSkipReason = 'empty' | 'comment' | 'unsupported' | 'too-broad';

export interface CosmeticSkip {
  readonly line: string;
  readonly reason: CosmeticSkipReason;
}

/** Selectors to add plus the exceptions (`#@#`) that cancel them. */
export interface CosmeticSelectors {
  readonly selectors: readonly string[];
  readonly exceptions: readonly string[];
}

export interface CosmeticBundle {
  /** Applies on every site. */
  readonly generic: CosmeticSelectors;
  /** Applies on a host and its subdomains; keyed by lower-case domain. */
  readonly domains: Readonly<Record<string, CosmeticSelectors>>;
}

export interface CosmeticResult {
  readonly bundle: CosmeticBundle;
  readonly skipped: readonly CosmeticSkip[];
}

/** Source list bundled with the extension (declared in build-rulesets.ts). */
export const COSMETIC_SOURCE = 'rules/source/cosmetic.txt';

/** Extension-root-relative outputs (what T021 loads at runtime). */
export const COSMETIC_OUTPUT = {
  generic: 'rules/cosmetic/generic.json',
  domainSpecific: 'rules/cosmetic/domain-specific.json',
} as const;

const GENERIC_HIDE = '##';
const GENERIC_EXCEPTION = '#@#';
const EXTENDED_HIDE = '#?#';

/** `*` or a bare tag name (e.g. `div`) — far too broad to hide safely. */
const TOO_BROAD = /^(?:\*|[a-z][a-z0-9]*)$/i;

/**
 * ABP/uBO procedural pseudo-classes that are *not* valid CSS, so a plain
 * `<style>` injection cannot express them (algorithm.md §D, plan.md §6).
 */
const PROCEDURAL =
  /:(?:has-text|matches-(?:css|attr|path)|xpath|style|remove|upward|watch-attr|min-text-length|others|nth-ancestor|if|if-not|abp-)/;

/** Lower-case domain token: letters, digits, dots and hyphens. */
const DOMAIN_TOKEN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

interface ParsedCosmetic {
  readonly domains: readonly string[];
  readonly selector: string;
  readonly kind: 'hide' | 'exception';
}

type ParseOutcome =
  | { readonly kind: 'parsed'; readonly rule: ParsedCosmetic }
  | { readonly kind: 'skip'; readonly reason: CosmeticSkipReason };

function isComment(line: string): boolean {
  return line.startsWith('!') || (line.startsWith('[') && line.endsWith(']'));
}

/** Returns the earliest cosmetic separator in `line`, if any. */
function detectSeparator(
  line: string,
): { readonly sep: string; readonly index: number } | undefined {
  let best: { sep: string; index: number } | undefined;
  for (const sep of [GENERIC_EXCEPTION, EXTENDED_HIDE, GENERIC_HIDE]) {
    const index = line.indexOf(sep);
    if (index >= 0 && (best === undefined || index < best.index)) {
      best = { sep, index };
    }
  }
  return best;
}

/** Empty input -> generic rule; `undefined` -> unsupported (e.g. `~domain`). */
function parseDomains(part: string): readonly string[] | undefined {
  if (part === '') {
    return [];
  }
  const tokens = part
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== '');
  if (tokens.some((token) => token.startsWith('~') || !DOMAIN_TOKEN.test(token))) {
    return undefined;
  }
  return tokens;
}

function parseCosmeticLine(rawLine: string): ParseOutcome {
  const line = rawLine.trim();
  if (line === '') {
    return { kind: 'skip', reason: 'empty' };
  }
  if (isComment(line)) {
    return { kind: 'skip', reason: 'comment' };
  }
  const found = detectSeparator(line);
  if (found === undefined || found.sep === EXTENDED_HIDE) {
    return { kind: 'skip', reason: 'unsupported' };
  }
  const selector = line.slice(found.index + found.sep.length).trim();
  if (selector === '') {
    return { kind: 'skip', reason: 'unsupported' };
  }
  if (PROCEDURAL.test(selector)) {
    return { kind: 'skip', reason: 'unsupported' };
  }
  if (TOO_BROAD.test(selector)) {
    return { kind: 'skip', reason: 'too-broad' };
  }
  const domains = parseDomains(line.slice(0, found.index).trim());
  if (domains === undefined) {
    return { kind: 'skip', reason: 'unsupported' };
  }
  return {
    kind: 'parsed',
    rule: { domains, selector, kind: found.sep === GENERIC_EXCEPTION ? 'exception' : 'hide' },
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function emptyBucket(): { selectors: string[]; exceptions: string[] } {
  return { selectors: [], exceptions: [] };
}

function toSelectors(bucket: { selectors: string[]; exceptions: string[] }): CosmeticSelectors {
  return { selectors: unique(bucket.selectors), exceptions: unique(bucket.exceptions) };
}

/**
 * Parses cosmetic filter lines into the generic + domain-specific bundles.
 *
 * Skips are collected (never dropped silently) so `build-rulesets.ts` can
 * report them at build time.
 */
export function buildCosmetic(lines: readonly string[]): CosmeticResult {
  const generic = emptyBucket();
  const domains = new Map<string, { selectors: string[]; exceptions: string[] }>();
  const skipped: CosmeticSkip[] = [];

  for (const rawLine of lines) {
    const outcome = parseCosmeticLine(rawLine);
    if (outcome.kind === 'skip') {
      skipped.push({ line: rawLine.trim(), reason: outcome.reason });
      continue;
    }
    const { domains: targets, selector, kind } = outcome.rule;
    const buckets = targets.length === 0 ? [generic] : targets.map((d) => bucketFor(domains, d));
    for (const bucket of buckets) {
      (kind === 'hide' ? bucket.selectors : bucket.exceptions).push(selector);
    }
  }

  return {
    bundle: { generic: toSelectors(generic), domains: toRecord(domains) },
    skipped,
  };
}

function bucketFor(
  domains: Map<string, { selectors: string[]; exceptions: string[] }>,
  domain: string,
): { selectors: string[]; exceptions: string[] } {
  const existing = domains.get(domain);
  if (existing !== undefined) {
    return existing;
  }
  const created = emptyBucket();
  domains.set(domain, created);
  return created;
}

/** Sorted by domain so the emitted JSON is stable between builds. */
function toRecord(
  domains: Map<string, { selectors: string[]; exceptions: string[] }>,
): Record<string, CosmeticSelectors> {
  const record: Record<string, CosmeticSelectors> = {};
  for (const domain of [...domains.keys()].sort()) {
    const bucket = domains.get(domain);
    if (bucket !== undefined) {
      record[domain] = toSelectors(bucket);
    }
  }
  return record;
}

export interface CosmeticJson {
  readonly generic: string;
  readonly domainSpecific: string;
}

/** Pretty JSON with a trailing newline, matching the DNR ruleset output style. */
export function serializeCosmetic(bundle: CosmeticBundle): CosmeticJson {
  return {
    generic: `${JSON.stringify(bundle.generic, null, 2)}\n`,
    domainSpecific: `${JSON.stringify(bundle.domains, null, 2)}\n`,
  };
}
