/**
 * Message contract between the injected page components and the worker
 * (Phase 9 §4 element inspector, Phase 7 security banner).
 *
 * The picker and the warning banner run in a page, so everything they send is
 * untrusted input: the worker re-validates every message and every value. The
 * string constants live here so the popup, the content modules and the worker
 * all agree on them; the injected functions (which are serialised, so they
 * cannot import) use the same literals and `tests/unit/messages.test.ts` guards
 * that the two never drift apart.
 */

/** The picker asks the worker to persist a hidden-element selector. */
export const MSG_HIDE_ELEMENT = 'wg:hide-element';
/** The banner asks the worker to never show itself on this host again. */
export const MSG_TRUST_SITE = 'wg:trust-site';
/** The popup asks the worker to inject the picker into a tab. */
export const MSG_START_PICKER = 'wg:start-picker';

export interface HideElementMessage {
  readonly type: typeof MSG_HIDE_ELEMENT;
  readonly selector: string;
}

export interface TrustSiteMessage {
  readonly type: typeof MSG_TRUST_SITE;
}

export interface StartPickerMessage {
  readonly type: typeof MSG_START_PICKER;
  readonly tabId: number;
}

export type BridgeMessage = HideElementMessage | TrustSiteMessage | StartPickerMessage;

/** What the worker answers; `reason` is a stable code the UI localises. */
export interface BridgeReply {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Which in-page security banner a top-level page deserves (Phase 7). Shared so
 * the worker (which decides) and the banner (which renders) agree on the set.
 */
export type BannerReason = 'insecure' | 'spoofed';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Runtime guard for anything arriving on `chrome.runtime.onMessage`. */
export function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!isRecord(value)) {
    return false;
  }
  switch (value['type']) {
    case MSG_HIDE_ELEMENT:
      return typeof value['selector'] === 'string';
    case MSG_TRUST_SITE:
      return true;
    case MSG_START_PICKER:
      return typeof value['tabId'] === 'number' && Number.isFinite(value['tabId']);
    default:
      return false;
  }
}
