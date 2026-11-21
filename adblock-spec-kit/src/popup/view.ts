/**
 * Popup view helpers (Phase 2 / 12).
 *
 * Pure, DOM-only rendering kept apart from `popup.ts` so the wiring stays short
 * and small. Icons are built with `createElementNS` from compile-time path
 * constants — never `innerHTML` with dynamic content — so nothing user-supplied
 * can ever be parsed as markup (Constitution 13).
 */

import { t, type Locale, type MessageKey } from '../shared/i18n';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Stable module ids used both for the row and its `data-` attribute. */
export type ModuleId = 'ads' | 'trackers' | 'cosmetic' | 'web' | 'https' | 'url';

/** One protection module shown in the summary list. */
export interface ModuleView {
  readonly id: ModuleId;
  readonly label: MessageKey;
  readonly on: boolean;
  /** Dashboard section (hash) this row opens. */
  readonly section: string;
}

/** Lucide-style path data, one array of `d` strings per icon. */
const ICONS: Record<string, readonly string[]> = {
  ads: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6'],
  trackers: [
    'M9.88 9.88a3 3 0 1 0 4.24 4.24',
    'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68',
    'M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61',
    'm2 2 20 20',
  ],
  cosmetic: ['M3 4h18v16H3z', 'M3 9h18', 'M9 9v11'],
  web: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M12 8v4', 'M12 16h.01'],
  https: ['M6 11V7a6 6 0 0 1 12 0v4', 'M5 11h14v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z'],
  url: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
};

/** Builds one inline SVG icon from the path table. */
export function icon(paths: readonly string[], size = 18): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/**
 * Renders the module summary. Each row is a button that opens the matching
 * dashboard section, so the popup never hosts a settings form of its own.
 */
export function renderModules(
  container: HTMLElement,
  modules: readonly ModuleView[],
  locale: Locale,
  onOpen: (section: string) => void,
): void {
  container.replaceChildren();
  for (const mod of modules) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'mod-row';
    row.dataset['module'] = mod.id;
    row.dataset['on'] = String(mod.on);

    const ic = document.createElement('span');
    ic.className = `ic${mod.on ? '' : ' off'}`;
    ic.append(icon(ICONS[mod.id] ?? [], 16));

    const name = document.createElement('span');
    name.className = 'nm';
    name.textContent = t(mod.label, locale);

    const state = document.createElement('span');
    state.className = 'st';
    state.textContent = t(mod.on ? 'gEnabled' : 'gDisabled', locale);

    row.append(ic, name, state);
    row.addEventListener('click', () => onOpen(mod.section));
    container.append(row);
  }
}

/** Maps a URL-scan finding id to its localised explanation (Phase 7). */
export function findingKey(id: string): MessageKey | undefined {
  const key = `scanF${id}` as MessageKey;
  return key;
}

/** Maps a scan verdict to the matching heading key. */
export function verdictKey(verdict: string): MessageKey {
  switch (verdict) {
    case 'dangerous':
      return 'scanVerdictDangerous';
    case 'suspicious':
      return 'scanVerdictSuspicious';
    case 'safe':
      return 'scanVerdictSafe';
    default:
      return 'scanVerdictUnknown';
  }
}
