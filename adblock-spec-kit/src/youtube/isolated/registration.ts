/**
 * Content-script registration seam for the rebuilt YouTube engine (Phase 5
 * integration).
 *
 * The engine is two content scripts: the rebuilt MAIN-world engine
 * (`youtube-main.js`) and its ISOLATED-world bridge (`youtube-isolated.js`),
 * which publishes the flag snapshot the MAIN side reads (T004). This module owns
 * the `chrome.scripting.registerContentScripts` calls so activation is driven by
 * the module switch without the worker reaching into `chrome.*` directly (that
 * keeps the calls unit-testable with a fake API).
 *
 * The two scripts are registered and unregistered together and idempotently, so
 * a worker restart cannot double-register and turning the module off leaves
 * neither script behind. Every function is fail-open: a registration failure
 * returns a result object and never throws, so a scripting error can never take
 * down the worker.
 */

/** The shape of one content-script registration (mirrors the Chrome API). */
export interface ContentScriptRegistration {
  readonly id: string;
  readonly matches: readonly string[];
  readonly js: readonly string[];
  readonly runAt: 'document_start';
  readonly world: 'MAIN' | 'ISOLATED';
  readonly persistAcrossSessions: boolean;
}

/** The subset of `chrome.scripting` this seam needs; injected for tests. */
export interface ScriptingApi {
  getRegisteredContentScripts(
    filter?: { readonly ids?: readonly string[] },
  ): Promise<readonly { readonly id: string }[]>;
  registerContentScripts(scripts: readonly ContentScriptRegistration[]): Promise<void>;
  unregisterContentScripts(filter?: { readonly ids?: readonly string[] }): Promise<void>;
}

/** Stable id so registration is idempotent across worker restarts. */
export const ENGINE_SCRIPT_ID = 'wg-youtube-engine-main';
/** The bundle emitted by `vite.youtube.config.ts`. */
export const ENGINE_SCRIPT_FILE = 'youtube-main.js';

/** Stable id of the ISOLATED-world bridge companion. */
export const BRIDGE_SCRIPT_ID = 'wg-youtube-engine-isolated';
/** The bundle emitted by `vite.youtube-isolated.config.ts`. */
export const BRIDGE_SCRIPT_FILE = 'youtube-isolated.js';

/** Every id the module owns, so cleanup never leaves one half registered. */
export const ENGINE_SCRIPT_IDS: readonly string[] = [ENGINE_SCRIPT_ID, BRIDGE_SCRIPT_ID];

/** Matches the engine is registered for; both scripts share them. */
const ENGINE_MATCHES: readonly string[] = ['*://*.youtube.com/*'];

export interface SyncResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/** The registration descriptor for the engine's MAIN content script. */
export function engineRegistration(): ContentScriptRegistration {
  return {
    id: ENGINE_SCRIPT_ID,
    matches: [...ENGINE_MATCHES],
    js: [ENGINE_SCRIPT_FILE],
    runAt: 'document_start',
    world: 'MAIN',
    persistAcrossSessions: true,
  };
}

/** The registration descriptor for the ISOLATED-world bridge (T004 transport). */
export function bridgeRegistration(): ContentScriptRegistration {
  return {
    id: BRIDGE_SCRIPT_ID,
    matches: [...ENGINE_MATCHES],
    js: [BRIDGE_SCRIPT_FILE],
    runAt: 'document_start',
    world: 'ISOLATED',
    persistAcrossSessions: true,
  };
}

/** Both registrations, applied together. */
function registrations(): ContentScriptRegistration[] {
  return [engineRegistration(), bridgeRegistration()];
}

async function isRegistered(api: ScriptingApi): Promise<boolean> {
  const scripts = await api.getRegisteredContentScripts({ ids: [ENGINE_SCRIPT_ID] });
  return scripts.some((script) => script.id === ENGINE_SCRIPT_ID);
}

/** True when the engine's MAIN script is registered (used by the popup). */
export async function isEngineRegistered(api: ScriptingApi): Promise<boolean> {
  try {
    return await isRegistered(api);
  } catch {
    return false;
  }
}

/**
 * Brings both engine registrations in line with `enabled`. Idempotent: enabling
 * when already registered (and disabling when already absent) is a no-op.
 */
export async function syncEngineRegistration(
  api: ScriptingApi,
  enabled: boolean,
): Promise<SyncResult> {
  try {
    const registered = await isRegistered(api);
    if (enabled && !registered) {
      await api.registerContentScripts(registrations());
    } else if (!enabled && registered) {
      await api.unregisterContentScripts({ ids: [...ENGINE_SCRIPT_IDS] });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * The seam wired to the real `chrome.scripting` (worker and popup side). Arrays
 * are copied into mutable ones because the Chrome typings reject the readonly
 * shapes the seam is expressed with. Fail-open lives in the callers.
 */
export function createChromeScriptingApi(): ScriptingApi {
  return {
    getRegisteredContentScripts: (filter) =>
      chrome.scripting.getRegisteredContentScripts(
        filter?.ids === undefined ? undefined : { ids: [...filter.ids] },
      ),
    registerContentScripts: async (scripts) => {
      await chrome.scripting.registerContentScripts(
        scripts.map((script) => ({
          id: script.id,
          matches: [...script.matches],
          js: [...script.js],
          runAt: script.runAt,
          world: script.world,
          persistAcrossSessions: script.persistAcrossSessions,
        })),
      );
    },
    unregisterContentScripts: (filter) =>
      chrome.scripting.unregisterContentScripts(
        filter?.ids === undefined ? undefined : { ids: [...filter.ids] },
      ),
  };
}
