/**
 * XHR interceptor (Phase 1 — main layer).
 *
 * `createXhrInterceptor` returns a `wrap(OriginalXhr)` that subclasses the
 * injected XHR constructor, so the whole thing is testable in Node without a
 * browser. The subclass:
 *  - records the request URL by delegating through the native `open`;
 *  - rewrites the response only after the native object is fully populated, by
 *    listening for `loadend` (with a `readystatechange` fallback);
 *  - touches ONLY `responseText`/`response` for `''`/`text`/`json` responses of
 *    the player endpoint, and never changes `responseType`, `status` or any
 *    other property;
 *  - is fail-open: any error leaves the native response exactly as it was.
 */

import type { FeatureFlags } from '../config/flags';
import type { DebugLogger } from '../core/debug-logger';

export interface XhrLike {
  open(...args: unknown[]): void;
  send(body?: unknown): void;
  readonly responseText: string;
  readonly response: unknown;
  readonly responseType: string;
  readonly status: number;
  addEventListener(type: string, cb: () => void): void;
}

export type XhrConstructor = new () => XhrLike;

export interface XhrInterceptorDeps {
  readonly flags: FeatureFlags;
  readonly logger: DebugLogger;
  readonly pruneAdFields: (
    rawText: string,
  ) => { readonly text: string; readonly removed: number } | null;
  readonly isAdFieldPresent: (rawText: string) => boolean;
}

export interface XhrInterceptor {
  readonly name: 'xhr-interceptor';
  wrap(OriginalXhr: XhrConstructor): XhrConstructor;
}

/** The player endpoint whose JSON response carries the ad fields. */
const PLAYER_PATH = '/youtubei/v1/player';

export function createXhrInterceptor(deps: XhrInterceptorDeps): XhrInterceptor {
  function wrap(OriginalXhr: XhrConstructor): XhrConstructor {
    const proto = OriginalXhr.prototype;
    const Base = OriginalXhr as unknown as new () => XhrLike;

    class InterceptedXhr extends Base {
      constructor() {
        super();
        const instance = this as unknown as Record<string, unknown>;
        let url: string | undefined;
        let handled = false;

        // Capture the request URL while delegating to the native `open`.
        try {
          const nativeOpen = proto.open;
          instance['open'] = function (this: unknown, ...args: unknown[]): void {
            try {
              const first = args[0];
              if (typeof first === 'string') {
                url = first;
              }
            } catch {
              // fail-open: keep the URL unknown rather than break the request.
            }
            nativeOpen.apply(this, args);
          };
        } catch {
          // fail-open
        }

        const rewrite = (): void => {
          if (handled) {
            return;
          }
          handled = true;
          try {
            applyXhrRewrite(deps, this as unknown as XhrLike, url);
          } catch {
            // fail-open
          }
        };

        try {
          this.addEventListener('loadend', rewrite);
        } catch {
          // fail-open
        }
        try {
          this.addEventListener('readystatechange', () => {
            try {
              if ((this as unknown as { readyState?: unknown }).readyState === 4) {
                rewrite();
              }
            } catch {
              // fail-open
            }
          });
        } catch {
          // fail-open
        }
      }
    }

    return InterceptedXhr as unknown as XhrConstructor;
  }

  return { name: 'xhr-interceptor', wrap };
}

function applyXhrRewrite(
  deps: XhrInterceptorDeps,
  xhr: XhrLike,
  url: string | undefined,
): void {
  if (!deps.flags.get('ENABLE_XHR_HOOK')) {
    return;
  }
  if (url === undefined || !url.includes(PLAYER_PATH)) {
    return;
  }
  const responseType = xhr.responseType;
  if (!(responseType === '' || responseType === 'text' || responseType === 'json')) {
    return;
  }

  if (responseType === 'json') {
    const current = xhr.response;
    if (current === null || typeof current !== 'object') {
      return;
    }
    const text = safeStringify(current);
    if (text === null || !deps.isAdFieldPresent(text)) {
      return;
    }
    const pruned = deps.pruneAdFields(text);
    if (pruned === null || pruned.removed <= 0) {
      return;
    }
    const parsed = safeParse(pruned.text);
    if (parsed === undefined) {
      return;
    }
    defineValue(xhr, 'response', parsed);
    return;
  }

  const raw = readResponseText(xhr);
  if (raw === null || !deps.isAdFieldPresent(raw)) {
    return;
  }
  const pruned = deps.pruneAdFields(raw);
  if (pruned === null || pruned.removed <= 0) {
    return;
  }
  defineValue(xhr, 'responseText', pruned.text);
  defineValue(xhr, 'response', pruned.text);
}

function readResponseText(xhr: XhrLike): string | null {
  try {
    const value = xhr.responseText;
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function defineValue(target: object, key: string, value: unknown): void {
  try {
    Object.defineProperty(target, key, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    // fail-open: a non-configurable property is left alone.
  }
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
