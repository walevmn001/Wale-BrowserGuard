import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_FLAGS, FeatureFlags, type FlagName } from '../../../src/youtube/config/flags';
import { DebugLogger } from '../../../src/youtube/core/debug-logger';
import {
  createFetchInterceptor,
  type FetchLike,
} from '../../../src/youtube/main/fetch-interceptor';
import { makeResponse } from '../../../src/youtube/testing/harness';

const PLAYER_URL = 'https://www.youtube.com/youtubei/v1/player?key=abc';

function makeFlags(overrides: Partial<Record<FlagName, boolean>> = {}): FeatureFlags {
  const defaults: Record<FlagName, boolean> = { ...DEFAULT_FLAGS, ...overrides };
  return new FeatureFlags(defaults);
}

function pruneAdFields(raw: string): { text: string; removed: number } | null {
  if (!raw.includes('"adPlacements"')) {
    return null;
  }
  return { text: '{"keep":true}', removed: 1 };
}

const isAdFieldPresent = (raw: string): boolean => raw.includes('"adPlacements"');

function makeInterceptor(overrides: Partial<Record<FlagName, boolean>> = {}) {
  const spy = vi.fn(pruneAdFields);
  const interceptor = createFetchInterceptor({
    flags: makeFlags(overrides),
    logger: new DebugLogger(),
    pruneAdFields: spy,
    isAdFieldPresent,
  });
  return { interceptor, pruneAdFields: spy };
}

describe('createFetchInterceptor', () => {
  it('names itself and returns the original response when the hook is off', async () => {
    const { interceptor, pruneAdFields: spy } = makeInterceptor({ ENABLE_FETCH_HOOK: false });
    const original = makeResponse('{"adPlacements":[]}', { url: PLAYER_URL });
    const wrapped = interceptor.wrap(async () => original);

    const result = await wrapped(PLAYER_URL);

    expect(interceptor.name).toBe('fetch-interceptor');
    expect(result).toBe(original);
    expect(spy).not.toHaveBeenCalled();
  });

  it('leaves a non-player response untouched', async () => {
    const { interceptor, pruneAdFields: spy } = makeInterceptor();
    const original = makeResponse('{"adPlacements":[]}', { url: 'https://example.com/other' });
    const wrapped = interceptor.wrap(async () => original);

    expect(await wrapped('https://example.com/other')).toBe(original);
    expect(spy).not.toHaveBeenCalled();
  });

  it('leaves a non-ok response untouched', async () => {
    const { interceptor } = makeInterceptor();
    const original = makeResponse('nope', { status: 500, url: PLAYER_URL });
    const wrapped = interceptor.wrap(async () => original);

    expect(await wrapped(PLAYER_URL)).toBe(original);
  });

  it('leaves the response untouched when no ad field is present', async () => {
    const { interceptor, pruneAdFields: spy } = makeInterceptor();
    const original = makeResponse('{"keep":true}', { url: PLAYER_URL });
    const wrapped = interceptor.wrap(async () => original);

    expect(await wrapped(PLAYER_URL)).toBe(original);
    expect(spy).not.toHaveBeenCalled();
  });

  it('leaves the response untouched when the pruner makes no change', async () => {
    const original = makeResponse('{"adPlacements":[1]}', { url: PLAYER_URL });
    const interceptor = createFetchInterceptor({
      flags: makeFlags(),
      logger: new DebugLogger(),
      pruneAdFields: vi.fn(() => ({ text: '{"adPlacements":[1]}', removed: 0 })),
      isAdFieldPresent: () => true,
    });
    const wrapped = interceptor.wrap(async () => original);

    expect(await wrapped(PLAYER_URL)).toBe(original);
  });

  it('rewrites a player response that carries ad fields, preserving status and headers', async () => {
    const { interceptor } = makeInterceptor();
    const original = makeResponse('{"adPlacements":[1],"keep":true}', {
      url: PLAYER_URL,
      headers: { 'content-type': 'application/json', 'x-test': 'yes' },
    });
    const wrapped = interceptor.wrap(async () => original);

    const result = await wrapped(PLAYER_URL);

    expect(result).not.toBe(original);
    expect(await result.text()).toBe('{"keep":true}');
    expect(result.status).toBe(200);
    expect(result.headers.get('x-test')).toBe('yes');
  });

  it('does not consume the original response body', async () => {
    const { interceptor } = makeInterceptor();
    const original = makeResponse('{"adPlacements":[1]}', { url: PLAYER_URL });
    const wrapped = interceptor.wrap(async () => original);

    await wrapped(PLAYER_URL);

    expect(await original.text()).toBe('{"adPlacements":[1]}');
  });

  it('propagates a failure from the original fetch unchanged', async () => {
    const { interceptor } = makeInterceptor();
    const failing: FetchLike = async () => {
      throw new Error('network down');
    };
    const wrapped = interceptor.wrap(failing);

    await expect(wrapped(PLAYER_URL)).rejects.toThrow('network down');
  });
});
