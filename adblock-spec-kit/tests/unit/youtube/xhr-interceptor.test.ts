import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FLAGS, FeatureFlags, type FlagName } from '../../../src/youtube/config/flags';
import { DebugLogger } from '../../../src/youtube/core/debug-logger';
import {
  createXhrInterceptor,
  type XhrConstructor,
  type XhrInterceptor,
} from '../../../src/youtube/main/xhr-interceptor';
import { FakeXhr } from '../../../src/youtube/testing/harness';

const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?key=abc';

function makeFlags(overrides: Partial<Record<FlagName, boolean>> = {}): FeatureFlags {
  const defaults: Record<FlagName, boolean> = { ...DEFAULT_FLAGS, ...overrides };
  return new FeatureFlags(defaults);
}

function makeInterceptor(
  overrides: Partial<Record<FlagName, boolean>> = {},
  prune: (raw: string) => { text: string; removed: number } | null = defaultPrune,
): XhrInterceptor {
  return createXhrInterceptor({
    flags: makeFlags(overrides),
    logger: new DebugLogger(),
    pruneAdFields: prune,
    isAdFieldPresent: (raw) => raw.includes('"adPlacements"'),
  });
}

function defaultPrune(raw: string): { text: string; removed: number } | null {
  if (!raw.includes('"adPlacements"')) {
    return null;
  }
  return { text: '{"keep":true}', removed: 1 };
}

/** Builds an intercepted instance of the fake XHR. */
function newXhr(interceptor: XhrInterceptor): FakeXhr {
  const Wrapped = interceptor.wrap(FakeXhr as unknown as XhrConstructor);
  return new Wrapped() as unknown as FakeXhr;
}

describe('createXhrInterceptor', () => {
  it('names itself', () => {
    expect(makeInterceptor().name).toBe('xhr-interceptor');
  });

  it('leaves a non-player response untouched', () => {
    const xhr = newXhr(makeInterceptor());
    xhr.open('https://example.com/other');
    xhr.responseText = '{"adPlacements":[1]}';

    xhr.dispatch('loadend');

    expect(xhr.responseText).toBe('{"adPlacements":[1]}');
  });

  it('leaves the response untouched when the hook is off', () => {
    const prune = vi.fn(defaultPrune);
    const xhr = newXhr(makeInterceptor({ ENABLE_XHR_HOOK: false }, prune));
    xhr.open(PLAYER_URL);
    xhr.responseText = '{"adPlacements":[1]}';

    xhr.dispatch('loadend');

    expect(xhr.responseText).toBe('{"adPlacements":[1]}');
    expect(prune).not.toHaveBeenCalled();
  });

  it('ignores a non-text response type', () => {
    const xhr = newXhr(makeInterceptor());
    xhr.open(PLAYER_URL);
    xhr.responseType = 'blob';
    xhr.responseText = '{"adPlacements":[1]}';

    xhr.dispatch('loadend');

    expect(xhr.responseText).toBe('{"adPlacements":[1]}');
  });

  it('rewrites a text player response', () => {
    const xhr = newXhr(makeInterceptor());
    xhr.open(PLAYER_URL);
    xhr.responseType = '';
    xhr.responseText = '{"adPlacements":[1],"keep":true}';

    xhr.dispatch('loadend');

    expect(xhr.responseText).toBe('{"keep":true}');
    expect(xhr.response).toBe('{"keep":true}');
  });

  it('rewrites a json player response', () => {
    const xhr = newXhr(makeInterceptor());
    xhr.open(PLAYER_URL);
    xhr.responseType = 'json';
    xhr.response = { adPlacements: [1], keep: true };

    xhr.dispatch('loadend');

    expect(xhr.response).toEqual({ keep: true });
  });

  it('does not change the status or the response type', () => {
    const xhr = newXhr(makeInterceptor());
    xhr.open(PLAYER_URL);
    xhr.responseType = 'text';
    xhr.status = 200;
    xhr.responseText = '{"adPlacements":[1],"keep":true}';

    xhr.dispatch('loadend');

    expect(xhr.status).toBe(200);
    expect(xhr.responseType).toBe('text');
  });

  it('rewrites only once even if the event fires twice', () => {
    const prune = vi.fn(defaultPrune);
    const xhr = newXhr(makeInterceptor({}, prune));
    xhr.open(PLAYER_URL);
    xhr.responseType = '';
    xhr.responseText = '{"adPlacements":[1],"keep":true}';

    xhr.dispatch('loadend');
    xhr.dispatch('loadend');

    expect(prune).toHaveBeenCalledTimes(1);
  });

  it('is fail-open when the pruner throws', () => {
    const prune = vi.fn((_raw: string) => {
      throw new Error('boom');
    });
    const xhr = newXhr(makeInterceptor({}, prune));
    xhr.open(PLAYER_URL);
    xhr.responseType = '';
    xhr.responseText = '{"adPlacements":[1],"keep":true}';

    expect(() => xhr.dispatch('loadend')).not.toThrow();
    expect(xhr.responseText).toBe('{"adPlacements":[1],"keep":true}');
  });
});
