/**
 * Fetch interceptor (Phase 1 — main layer).
 *
 * The only world-aware part of the fetch hook is the global `fetch`, which is
 * injected: `createFetchInterceptor` builds a `wrap(original)` that is fully
 * unit-testable in Node. The wrapper is fail-open in the strongest sense — on
 * any error, and on any response it does not intend to change, it returns the
 * ORIGINAL `Response` object untouched.
 *
 * When the hook is enabled it inspects a successful player response by reading
 * the body through `response.clone()`, so the original body is never consumed;
 * only if the text genuinely changed does it build a new `Response` with the
 * same status, status text and headers. All body work runs under a timeout.
 */

import type { FeatureFlags } from '../config/flags';
import type { DebugLogger } from '../core/debug-logger';
import { TUNING } from '../config/tuning';

export interface FetchLike {
  (input: unknown, init?: unknown): Promise<Response>;
}

export interface FetchInterceptorDeps {
  readonly flags: FeatureFlags;
  readonly logger: DebugLogger;
  readonly pruneAdFields: (
    rawText: string,
  ) => { readonly text: string; readonly removed: number } | null;
  readonly isAdFieldPresent: (rawText: string) => boolean;
}

export interface FetchInterceptor {
  readonly name: 'fetch-interceptor';
  wrap(original: FetchLike): FetchLike;
}

/** The player endpoint whose JSON response carries the ad fields. */
const PLAYER_PATH = '/youtubei/v1/player';

export function createFetchInterceptor(deps: FetchInterceptorDeps): FetchInterceptor {
  function wrap(original: FetchLike): FetchLike {
    return async function interceptedFetch(input: unknown, init?: unknown): Promise<Response> {
      // A failure from the original fetch is forwarded unchanged.
      const response = await original(input, init);
      try {
        return await maybeRewrite(deps, response, input);
      } catch {
        return response;
      }
    };
  }

  return { name: 'fetch-interceptor', wrap };
}

async function maybeRewrite(
  deps: FetchInterceptorDeps,
  response: Response,
  input: unknown,
): Promise<Response> {
  if (!deps.flags.get('ENABLE_FETCH_HOOK')) {
    return response;
  }
  if (!response.ok) {
    return response;
  }
  const url = resolveUrl(input, response);
  if (!url.includes(PLAYER_PATH)) {
    return response;
  }
  const rewritten = await withTimeout(inspect(deps, response), TUNING.fetchInterceptTimeoutMs);
  return rewritten ?? response;
}

async function inspect(deps: FetchInterceptorDeps, response: Response): Promise<Response | null> {
  // Size guard: never read (let alone rewrite) a body larger than the cap, so a
  // huge payload cannot stall playback through the hook.
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > TUNING.interceptMaxBodyChars) {
    return null;
  }
  // Read the body EXACTLY once, from a clone; the original is never consumed.
  const rawText = await response.clone().text();
  if (rawText.length > TUNING.interceptMaxBodyChars) {
    return null;
  }
  if (!deps.isAdFieldPresent(rawText)) {
    return null;
  }
  const pruned = deps.pruneAdFields(rawText);
  if (pruned === null || pruned.removed <= 0 || pruned.text === rawText) {
    return null;
  }
  return buildResponse(pruned.text, response);
}

function buildResponse(text: string, source: Response): Response {
  const headers = new Headers(source.headers);
  const next = new Response(text, {
    status: source.status,
    statusText: source.statusText,
    headers,
  });
  // The Response constructor cannot set the final URL; preserve it if we can.
  try {
    Object.defineProperty(next, 'url', { value: source.url, configurable: true });
  } catch {
    // ignore: the constructor already produced a valid response.
  }
  return next;
}

function resolveUrl(input: unknown, response: Response): string {
  try {
    if (typeof response.url === 'string' && response.url !== '') {
      return response.url;
    }
  } catch {
    // ignore and fall back to the request input
  }
  try {
    if (typeof input === 'string') {
      return input;
    }
    if (input !== null && typeof input === 'object') {
      const candidate = (input as { url?: unknown }).url;
      if (typeof candidate === 'string') {
        return candidate;
      }
    }
  } catch {
    // ignore
  }
  return '';
}

/** Settles with the promise's value, or `null` if `ms` elapses first. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ms);
    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(null);
        }
      },
    );
  });
}
