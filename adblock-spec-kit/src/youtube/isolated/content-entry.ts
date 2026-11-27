/**
 * ISOLATED-world content-script entry for the rebuilt YouTube engine (Phase 5
 * integration — the T004 dataset transport, adapter.md §6 option A).
 *
 * This is the file the `youtube-isolated.js` registration loads into a YouTube
 * page. Its only job is to bridge the extension's sync settings to the page: it
 * reads the user's per-layer choice and publishes the flag snapshot onto the one
 * root-element attribute (`data-wg-yt-flags`) that the MAIN engine reads. It adds
 * no permission and writes nothing but that attribute.
 *
 * It is deliberately the *only* place the ISOLATED side touches the page, and it
 * is fail-open end to end: a missing root, a throwing storage read or a blocked
 * attribute write all resolve to "publish nothing", which leaves the MAIN engine
 * on its A-3 default (all ON) — a snapshot can only ever *reduce* protection
 * through an explicit choice, never silently disable the engine.
 *
 * It re-publishes whenever the stored layer map changes, so toggling a layer in
 * the popup updates the live page without a reload.
 */

import {
  DatasetAdapter,
  type AttributeObserver,
  type AttributeTarget,
} from '../adapter/dataset-adapter';
import { FLAG_SCHEMA_VERSION, type FlagName, type FlagSnapshot } from '../config/flags';
import { createYouTubeEngineSettings, ENGINE_FLAGS_KEY } from './settings';

/** Guard so a double injection cannot install the bridge twice. */
const BRIDGE_GUARD = '__wgYtIsolatedBridge';

/** The root element, or null while the parser has not created `<html>` yet. */
function rootOrNull(): HTMLElement | null {
  return document.documentElement as HTMLElement | null;
}

/** The validated snapshot the MAIN engine applies (all twelve flags). */
function buildSnapshot(flags: Record<FlagName, boolean>): FlagSnapshot {
  return {
    schemaVersion: FLAG_SCHEMA_VERSION,
    flags,
    source: 'adapter',
    receivedAt: Date.now(),
  };
}

/** Runs `callback` once the root exists (immediately when it already does). */
function whenRoot(callback: () => void): void {
  if (rootOrNull() !== null) {
    callback();
    return;
  }
  try {
    const observer = new MutationObserver(() => {
      if (rootOrNull() !== null) {
        observer.disconnect();
        callback();
      }
    });
    observer.observe(document, { childList: true });
  } catch {
    // fail-open: without the root there is nothing to publish onto.
  }
}

/** Reads the stored choice and writes it onto the shared root attribute. */
function publishSnapshot(): void {
  whenRoot(() => {
    try {
      const root = rootOrNull();
      if (root === null) {
        return;
      }
      const target: AttributeTarget = root;
      const adapter = new DatasetAdapter({
        target,
        createObserver: (callback): AttributeObserver => new MutationObserver(callback),
      });
      void createYouTubeEngineSettings()
        .desiredFlags()
        .then((flags) => adapter.publish(buildSnapshot(flags)))
        .catch(() => undefined);
    } catch {
      // fail-open
    }
  });
}

function boot(): void {
  const scope = window as unknown as Record<string, unknown>;
  if (scope[BRIDGE_GUARD] === true) {
    return;
  }
  scope[BRIDGE_GUARD] = true;

  publishSnapshot();
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes[ENGINE_FLAGS_KEY] !== undefined) {
        publishSnapshot();
      }
    });
  } catch {
    // fail-open: the bridge still works for the initial publish.
  }
}

boot();
