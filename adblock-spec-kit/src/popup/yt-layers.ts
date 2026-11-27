/**
 * YouTube engine layer rows for the popup (Phase 6 — T017 / T071).
 *
 * Pure mapping from the stored desired state plus the adapter/snapshot health
 * to the six rows the popup paints. It is deliberately free of DOM and storage
 * so it can be unit-tested directly. The three MAIN rows always resolve through
 * the fixed priority table (`resolveDisplay`), so while the flag adapter is
 * WAITING they show WAITING_FOR_ADAPTER — never "off" (contract §3, §7). The
 * three ISOLATED rows reflect the effective state the ISOLATED module reports,
 * which for now is simply the stored choice.
 */

import type { AdapterState } from '../youtube/adapter/adapter';
import type { FlagName } from '../youtube/config/flags';
import { ISOLATED_LAYERS, MAIN_LAYERS, type LayerWorld } from '../youtube/config/layers';
import { displayMessage } from '../youtube/state/messages';
import {
  resolveDisplay,
  type DisplayState,
  type SnapshotState,
} from '../youtube/state/toggle-state';
import type { MessageKey } from '../shared/i18n';

/** One switch row the popup renders. */
export interface YtLayerRow {
  readonly flag: FlagName;
  readonly labelKey: MessageKey;
  readonly world: LayerWorld;
  /** Switch position = the saved (desired) choice. */
  readonly desired: boolean;
  readonly state: DisplayState;
  readonly message: string;
  /** True when a saved choice differs from the still-effective default. */
  readonly savedNotApplied: boolean;
}

/** Localised label per user-facing layer; unknown flags fall back to generic. */
const LAYER_LABELS: Partial<Record<FlagName, MessageKey>> = {
  ENABLE_JSON_PRUNER: 'ppYtLayerJsonPruner',
  ENABLE_FETCH_HOOK: 'ppYtLayerFetchHook',
  ENABLE_XHR_HOOK: 'ppYtLayerXhrHook',
  ENABLE_DNR: 'ppYtLayerDnr',
  ENABLE_RUNTIME_GUARD: 'ppYtLayerRuntimeGuard',
  ENABLE_CSS_HIDER: 'ppYtLayerCssHider',
};

function labelKeyFor(flag: FlagName): MessageKey {
  return LAYER_LABELS[flag] ?? 'gUnknown';
}

/** Builds the six rows, MAIN first, from the desired flags and adapter health. */
export function buildYtLayers(
  desired: Readonly<Record<FlagName, boolean>>,
  adapter: AdapterState,
  snapshot: SnapshotState,
): readonly YtLayerRow[] {
  const rows: YtLayerRow[] = [];

  for (const layer of MAIN_LAYERS) {
    const on = desired[layer.flag];
    const state = resolveDisplay({
      desired: on ? 'ON' : 'OFF',
      effective: on ? 'ENABLED' : 'DISABLED',
      adapter,
      snapshot,
    }).state;
    rows.push({
      flag: layer.flag,
      labelKey: labelKeyFor(layer.flag),
      world: layer.world,
      desired: on,
      state,
      message: displayMessage(state),
      savedNotApplied: state === 'WAITING_FOR_ADAPTER' && !on,
    });
  }

  for (const layer of ISOLATED_LAYERS) {
    const on = desired[layer.flag];
    const state: DisplayState = on ? 'ENABLED' : 'DISABLED';
    rows.push({
      flag: layer.flag,
      labelKey: labelKeyFor(layer.flag),
      world: layer.world,
      desired: on,
      state,
      message: displayMessage(state),
      savedNotApplied: false,
    });
  }

  return rows;
}

/** The group-level state the popup shows as a chip: the three MAIN rows agree. */
export function mainGroupState(rows: readonly YtLayerRow[]): {
  readonly state: DisplayState;
  readonly message: string;
} {
  const main = rows.find((row) => row.world === 'MAIN');
  return main === undefined
    ? { state: 'UNKNOWN', message: displayMessage('UNKNOWN') }
    : { state: main.state, message: main.message };
}
