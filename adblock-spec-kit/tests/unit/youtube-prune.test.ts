import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installYouTubePrune,
  YOUTUBE_PRUNE_LIMITS,
  type PruneLimits,
} from '../../src/content/youtube/prune-main';

/**
 * `installYouTubePrune` runs in the page's MAIN world, so it only touches
 * `window`, `window.JSON` and `window.Response`. This suite substitutes a fake
 * `window` (so the real globals are never mutated) and drives the three hooks
 * deterministically, without a browser. The real wiring is covered by
 * `tests/e2e/youtube-prune.spec.ts`.
 */

type ParseFn = (text: string, reviver?: unknown) => unknown;

class FakeResponse {
  private readonly payload: unknown;

  constructor(payload: unknown) {
    this.payload = payload;
  }

  json(): Promise<unknown> {
    return Promise.resolve(this.payload);
  }
}

interface FakeWindow {
  __adblockYtPrune?: boolean;
  ytInitialPlayerResponse?: unknown;
  JSON: { parse: ParseFn };
  Response: typeof FakeResponse;
}

const globals = globalThis as unknown as Record<string, unknown>;
const AD_FIELDS = ['adPlacements', 'playerAds'];

let win: FakeWindow;

/** Installs the prune into the fake page and returns nothing. */
function install(adFields: readonly string[] = AD_FIELDS, limits: PruneLimits = YOUTUBE_PRUNE_LIMITS): void {
  installYouTubePrune(adFields, limits);
}

beforeEach(() => {
  const realParse = JSON.parse.bind(JSON) as ParseFn;
  win = {
    JSON: { parse: realParse },
    Response: FakeResponse,
  };
  globals['window'] = win;
});

afterEach(() => {
  delete globals['window'];
});

describe('installYouTubePrune — ytInitialPlayerResponse', () => {
  it('prunes ad fields on the response already present, keeping content', () => {
    win.ytInitialPlayerResponse = {
      videoDetails: { videoId: 'mock-video', title: 'Mock' },
      streamingData: { formats: [{ itag: 18 }] },
      adPlacements: [{ ad: true }],
      playerAds: [{ ad: true }],
    };

    install();

    const response = win.ytInitialPlayerResponse as Record<string, unknown>;
    expect(response['adPlacements']).toBeUndefined();
    expect(response['playerAds']).toBeUndefined();
    // Content the video needs is untouched.
    expect((response['videoDetails'] as { videoId: string }).videoId).toBe('mock-video');
    expect(response['streamingData']).toBeDefined();
  });

  it('prunes every future assignment through the setter', () => {
    install();

    win.ytInitialPlayerResponse = { adPlacements: [1], keep: 'yes' };

    const response = win.ytInitialPlayerResponse as Record<string, unknown>;
    expect(response['adPlacements']).toBeUndefined();
    expect(response['keep']).toBe('yes');
  });

  it('is idempotent: a second call does not re-wrap anything', () => {
    install();
    const afterFirst = win.JSON.parse;

    install();

    expect(win.JSON.parse).toBe(afterFirst);
  });

  it('uses the configured field names, not a hard-coded list', () => {
    install(['customAdKey']);

    win.ytInitialPlayerResponse = { customAdKey: [1], adPlacements: [1], keep: 1 };

    const response = win.ytInitialPlayerResponse as Record<string, unknown>;
    expect(response['customAdKey']).toBeUndefined();
    // A key that is not configured is left alone.
    expect(response['adPlacements']).toEqual([1]);
    expect(response['keep']).toBe(1);
  });
});

describe('installYouTubePrune — depth and size limits', () => {
  it('stops at maxDepth and leaves deeper ad fields alone', () => {
    const limits: PruneLimits = { maxDepth: 2, maxKeys: 1000 };
    const deep: Record<string, unknown> = { adPlacements: ['deep'] };
    // Chain of nesting so the ad field sits below the depth limit.
    let root: Record<string, unknown> = deep;
    for (let level = 0; level < 3; level += 1) {
      root = { child: root };
    }
    win.ytInitialPlayerResponse = { shallow: { adPlacements: ['shallow'] }, ...root };

    install(AD_FIELDS, limits);

    const response = win.ytInitialPlayerResponse as Record<string, unknown>;
    // The shallow ad field (within the limit) is gone...
    expect((response['shallow'] as Record<string, unknown>)['adPlacements']).toBeUndefined();
    // ...but the one past `maxDepth` survives untouched.
    const deepAfter = ((response['child'] as Record<string, unknown>)['child'] as Record<string, unknown>)[
      'child'
    ] as Record<string, unknown>;
    expect(deepAfter['adPlacements']).toEqual(['deep']);
  });
});

describe('installYouTubePrune — JSON.parse and Response.json', () => {
  it('prunes a JSON.parse result that carries an ad field', () => {
    install();

    const parsed = win.JSON.parse('{"adPlacements":[1],"keep":2}') as Record<string, unknown>;
    expect(parsed['adPlacements']).toBeUndefined();
    expect(parsed['keep']).toBe(2);
  });

  it('prunes a Response.json() body', async () => {
    install();

    const body = await new win.Response({ playerAds: [1], keep: 3 }).json();
    expect((body as Record<string, unknown>)['playerAds']).toBeUndefined();
    expect((body as Record<string, unknown>)['keep']).toBe(3);
  });
});

describe('installYouTubePrune — fail-open', () => {
  it('never throws when the response property cannot be redefined', () => {
    Object.defineProperty(win, 'ytInitialPlayerResponse', {
      configurable: false,
      writable: false,
      value: { adPlacements: [1], keep: 1 },
    });

    expect(() => install()).not.toThrow();

    // The in-place prune still stripped the ad the video must not see.
    const response = win.ytInitialPlayerResponse as Record<string, unknown>;
    expect(response['adPlacements']).toBeUndefined();
    expect(response['keep']).toBe(1);
  });

  it('survives a hostile object whose getter throws', () => {
    const hostile: Record<string, unknown> = { keep: 1 };
    Object.defineProperty(hostile, 'boom', {
      enumerable: true,
      get() {
        throw new Error('nope');
      },
    });
    win.ytInitialPlayerResponse = { adPlacements: [1], hostile };

    expect(() => install()).not.toThrow();

    const response = win.ytInitialPlayerResponse as Record<string, unknown>;
    expect(response['adPlacements']).toBeUndefined();
  });
});
