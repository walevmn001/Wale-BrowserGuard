/**
 * Cosmetic (element-hiding) filters — T021.
 *
 * Pure selector/CSS logic plus a dependency-injected `applyCosmetic` that the
 * background service worker drives with `chrome.scripting.insertCSS`
 * (algorithm.md §D, plan.md §3). The selector data is the JSON the build emits
 * (T020): a `generic` set plus per-domain `selectors`/`exceptions`.
 *
 * Runtime rule for a host `h` (algorithm.md §D):
 *   generic.selectors ∪ domain[h].selectors − generic.exceptions − domain[h].exceptions
 * where `domain[h]` matches `h` itself and any parent suffix.
 *
 * No DOM observer here (dynamic ads are T022) and no module-level state: the
 * worker can be stopped at any time (Constitution 14).
 */

/** Selectors to hide plus the `#@#` exceptions that cancel them. */
export interface CosmeticSelectors {
  readonly selectors: readonly string[];
  readonly exceptions: readonly string[];
}

/** Mirrors `rules/cosmetic/*.json` (T020). */
export interface CosmeticData {
  readonly generic: CosmeticSelectors;
  readonly domains: Readonly<Record<string, CosmeticSelectors>>;
}

/** Style rules are chunked at this many selectors (algorithm.md §D). */
export const MAX_SELECTORS_PER_CHUNK = 500;

/** Extension-root-relative paths of the build output (T020). */
export const COSMETIC_PATHS = {
  generic: 'rules/cosmetic/generic.json',
  domainSpecific: 'rules/cosmetic/domain-specific.json',
} as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSelectors(value: unknown): value is CosmeticSelectors {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return isStringArray(record['selectors']) && isStringArray(record['exceptions']);
}

/** Validates the JSON loaded from the packaged cosmetic data files. */
export function isCosmeticData(value: unknown): value is CosmeticData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const domains = record['domains'];
  if (!isSelectors(record['generic']) || typeof domains !== 'object' || domains === null) {
    return false;
  }
  return Object.values(domains).every(isSelectors);
}

/**
 * The page host to match selectors against, or `undefined` for pages that
 * cannot be styled (browser pages, other extensions, `file:`, `data:`).
 */
export function pageHost(url: string | undefined): string | undefined {
  if (url === undefined) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== '') {
      return parsed.hostname.toLowerCase();
    }
  } catch {
    // Not a parseable URL: there is nothing to style.
  }
  return undefined;
}

/** Domain keys that apply to `host`: itself or any parent suffix. */
export function matchingDomains(
  host: string,
  domains: Readonly<Record<string, CosmeticSelectors>>,
): string[] {
  const lower = host.toLowerCase();
  return Object.keys(domains).filter((key) => lower === key || lower.endsWith(`.${key}`));
}

/** The selector set to hide on `host` (algorithm.md §D). */
export function selectorsForHost(host: string, data: CosmeticData): string[] {
  const included = new Set(data.generic.selectors);
  const excluded = new Set(data.generic.exceptions);

  for (const key of matchingDomains(host, data.domains)) {
    const entry = data.domains[key];
    if (entry === undefined) {
      continue;
    }
    for (const selector of entry.selectors) {
      included.add(selector);
    }
    for (const selector of entry.exceptions) {
      excluded.add(selector);
    }
  }

  return [...included].filter((selector) => !excluded.has(selector));
}

/** One `a, b { … }` rule per chunk of at most `MAX_SELECTORS_PER_CHUNK`. */
export function buildCosmeticCss(selectors: readonly string[]): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < selectors.length; index += MAX_SELECTORS_PER_CHUNK) {
    const batch = selectors.slice(index, index + MAX_SELECTORS_PER_CHUNK);
    chunks.push(`${batch.join(',\n')} { display: none !important; }\n`);
  }
  return chunks;
}

export interface CosmeticInjector {
  readonly loadData: () => Promise<CosmeticData>;
  readonly insertCss: (tabId: number, css: string) => Promise<void>;
}

/**
 * Injects the element-hiding CSS for `url`'s host into `tabId`.
 *
 * Returns the number of style chunks inserted (0 when the page cannot be
 * styled or has no matching selector). Errors from `insertCss` propagate so the
 * caller can log them.
 */
export async function applyCosmetic(
  injector: CosmeticInjector,
  tabId: number,
  url: string | undefined,
): Promise<number> {
  const host = pageHost(url);
  if (host === undefined) {
    return 0;
  }
  const data = await injector.loadData();
  const chunks = buildCosmeticCss(selectorsForHost(host, data));
  for (const css of chunks) {
    await injector.insertCss(tabId, css);
  }
  return chunks.length;
}
