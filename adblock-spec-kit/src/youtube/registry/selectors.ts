/**
 * DOM selector registry for the YouTube engine (Phase 1 — registry layer).
 *
 * Pure data: the registry is world-independent and holds no DOM references, so
 * the same selectors can be resolved in the MAIN world, the isolated world or a
 * test. Every entry is `UNVERIFIED`: the values are proposed from the spec and
 * MUST be confirmed against a real YouTube session before they are relied on.
 * When a selector turns out to be correct it is promoted to `VERIFIED`; a
 * selector that was never checked is never silently trusted.
 */

export type RegistryStatus = 'SPECIFIED' | 'UNVERIFIED' | 'VERIFIED';

export interface SelectorEntry {
  readonly value: string;
  readonly status: RegistryStatus;
  readonly note?: string;
}

export interface SelectorRegistry {
  readonly version: number;
  get(name: string): string | undefined;
  entries(): Readonly<Record<string, SelectorEntry>>;
}

export const SELECTOR_REGISTRY_VERSION = 1;

/** Applied to every entry until a real session confirms it. */
const UNVERIFIED_NOTE =
  'Proposed from the spec; must be confirmed in a real Chrome session before use.';

/** Individual skip-button selectors, tried in order by the action controller. */
const SKIP_BUTTON_SELECTORS: readonly string[] = [
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-skip-ad-button',
];

function unverified(value: string): SelectorEntry {
  return { value, status: 'UNVERIFIED', note: UNVERIFIED_NOTE };
}

function makeEntries(): Record<string, SelectorEntry> {
  return {
    PLAYER: unverified('#movie_player'),
    VIDEO: unverified('video'),
    AD_SHOWING_CLASS: unverified('ad-showing'),
    AD_MODULE: unverified('.ytp-ad-module'),
    OVERLAY: unverified('.ytp-ad-overlay-container'),
    SKIP_BUTTON: unverified(SKIP_BUTTON_SELECTORS.join(', ')),
  };
}

export function createSelectorRegistry(): SelectorRegistry {
  const entries = makeEntries();
  return {
    version: SELECTOR_REGISTRY_VERSION,
    get(name: string): string | undefined {
      return entries[name]?.value;
    },
    entries(): Readonly<Record<string, SelectorEntry>> {
      return { ...entries };
    },
  };
}

/** The skip-button selectors in priority order (a defensive copy). */
export function skipButtonSelectors(): readonly string[] {
  return [...SKIP_BUTTON_SELECTORS];
}
