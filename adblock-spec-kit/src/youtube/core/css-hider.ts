/**
 * Cosmetic CSS hider (Phase 5 — core).
 *
 * Pure builder for the stylesheet that hides rendered ad containers (spec
 * FR-013 / US-4). It never touches the DOM: it turns the registry's ad
 * selectors into a CSS string the world-aware injector drops into a single
 * `<style>` at `document_start`. Keeping the string building here makes the
 * "which selectors, in what shape" decision unit-testable.
 */

import type { SelectorRegistry } from '../registry/selectors';

/** Registry ids whose elements are hidden. Only player ad chrome — no layout gaps. */
export const HIDE_SELECTOR_IDS = ['AD_MODULE', 'OVERLAY'] as const;

/** Id of the injected `<style>` element (the injector keeps it single). */
export const STYLE_ELEMENT_ID = 'wg-youtube-hide-ads';

/** Resolves the hide selectors from the registry, skipping unknowns/empties. */
export function hideSelectors(registry: Pick<SelectorRegistry, 'get'>): string[] {
  const out: string[] = [];
  for (const id of HIDE_SELECTOR_IDS) {
    const value = registry.get(id);
    if (typeof value === 'string' && value.trim() !== '') {
      out.push(value.trim());
    }
  }
  return out;
}

/**
 * Builds the hide stylesheet. Returns an empty string when there is nothing to
 * hide, so a caller can skip injecting entirely.
 */
export function buildHideCss(selectors: readonly string[]): string {
  const list = selectors.map((selector) => selector.trim()).filter((selector) => selector.length > 0);
  if (list.length === 0) {
    return '';
  }
  return `${list.join(',\n')} { display: none !important; }`;
}
