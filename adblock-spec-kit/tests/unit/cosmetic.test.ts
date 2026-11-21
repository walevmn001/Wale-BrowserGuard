import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyCosmetic,
  buildCosmeticCss,
  createCosmeticDataCache,
  insertCosmeticStyle,
  isCosmeticData,
  matchingDomains,
  pageHost,
  selectorsForHost,
  MAX_SELECTORS_PER_CHUNK,
  type CosmeticData,
} from '../../src/content/cosmetic';

const DATA: CosmeticData = {
  generic: { selectors: ['.ad-banner', '.ad-slot'], exceptions: [] },
  domains: {
    'example.org': { selectors: ['.promo-box'], exceptions: ['.ad-banner'] },
    'news.example': { selectors: ['.inline-ad'], exceptions: [] },
  },
};

describe('pageHost', () => {
  it('returns the hostname for http(s) pages, lower-cased', () => {
    expect(pageHost('https://News.Example/Story')).toBe('news.example');
    expect(pageHost('http://127.0.0.1:8080/')).toBe('127.0.0.1');
  });

  it('returns undefined for pages that cannot be styled', () => {
    expect(pageHost(undefined)).toBeUndefined();
    expect(pageHost('chrome://extensions')).toBeUndefined();
    expect(pageHost('about:blank')).toBeUndefined();
    expect(pageHost('not a url')).toBeUndefined();
  });
});

describe('matchingDomains', () => {
  it('matches the host itself and any parent suffix', () => {
    expect(matchingDomains('example.org', DATA.domains)).toEqual(['example.org']);
    expect(matchingDomains('sub.example.org', DATA.domains)).toEqual(['example.org']);
    expect(matchingDomains('news.example', DATA.domains)).toEqual(['news.example']);
  });

  it('does not match unrelated or suffix-lookalike hosts', () => {
    expect(matchingDomains('notexample.org', DATA.domains)).toEqual([]);
    expect(matchingDomains('example', DATA.domains)).toEqual([]);
  });
});

describe('selectorsForHost', () => {
  it('returns the generic set when no domain rule matches', () => {
    expect(selectorsForHost('unrelated.test', DATA)).toEqual(['.ad-banner', '.ad-slot']);
  });

  it('adds matching domain selectors and subtracts the exceptions', () => {
    expect(selectorsForHost('example.org', DATA)).toEqual(['.ad-slot', '.promo-box']);
  });

  it('applies a domain rule to its subdomains', () => {
    expect(selectorsForHost('shop.example.org', DATA)).toEqual(['.ad-slot', '.promo-box']);
  });

  it('keeps first-seen order and removes duplicates', () => {
    const data: CosmeticData = {
      generic: { selectors: ['.a', '.a'], exceptions: [] },
      domains: { 'x.test': { selectors: ['.a', '.b'], exceptions: [] } },
    };

    expect(selectorsForHost('x.test', data)).toEqual(['.a', '.b']);
  });
});

describe('buildCosmeticCss', () => {
  it('emits nothing for an empty selector list', () => {
    expect(buildCosmeticCss([])).toEqual([]);
  });

  it('joins selectors into one display:none rule', () => {
    expect(buildCosmeticCss(['.a', '.b'])).toEqual(['.a,\n.b { display: none !important; }\n']);
  });

  it('chunks at MAX_SELECTORS_PER_CHUNK', () => {
    const selectors = Array.from({ length: MAX_SELECTORS_PER_CHUNK + 1 }, (_, i) => `.s${i}`);

    const chunks = buildCosmeticCss(selectors);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.split(',').length).toBe(MAX_SELECTORS_PER_CHUNK);
    expect(chunks[1]?.split(',').length).toBe(1);
  });
});

describe('isCosmeticData', () => {
  it('accepts the build output shape', () => {
    expect(isCosmeticData(DATA)).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isCosmeticData(null)).toBe(false);
    expect(isCosmeticData({ generic: { selectors: [1], exceptions: [] }, domains: {} })).toBe(
      false,
    );
    expect(isCosmeticData({ generic: { selectors: [] }, domains: {} })).toBe(false);
    expect(isCosmeticData({ domains: {} })).toBe(false);
  });
});

describe('createCosmeticDataCache', () => {
  it('loads the packaged data at most once (T040)', async () => {
    const load = vi.fn(() => Promise.resolve(DATA));
    const cached = createCosmeticDataCache(load);

    const first = await cached();
    const second = await cached();

    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toBe(DATA);
    expect(second).toBe(DATA);
    expect(first).toBe(second);
  });

  it('shares one in-flight load between concurrent callers', async () => {
    let resolveLoad: (data: CosmeticData) => void = () => undefined;
    const load = vi.fn(
      () =>
        new Promise<CosmeticData>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const cached = createCosmeticDataCache(load);

    const pending = Promise.all([cached(), cached()]);
    resolveLoad(DATA);

    await expect(pending).resolves.toEqual([DATA, DATA]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load, so the next call retries', async () => {
    const load = vi
      .fn<() => Promise<CosmeticData>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(DATA);
    const cached = createCosmeticDataCache(load);

    await expect(cached()).rejects.toThrow('boom');
    await expect(cached()).resolves.toBe(DATA);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('applyCosmetic', () => {
  it('injects one CSS chunk per matching host and reports the count', async () => {
    const insertCss = vi.fn<(tabId: number, css: string) => Promise<void>>(() => Promise.resolve());

    const count = await applyCosmetic(
      { loadData: () => Promise.resolve(DATA), insertCss },
      7,
      'https://example.org/',
    );

    expect(count).toBe(1);
    expect(insertCss).toHaveBeenCalledTimes(1);
    expect(insertCss).toHaveBeenCalledWith(
      7,
      '.ad-slot,\n.promo-box { display: none !important; }\n',
    );
  });

  it('does nothing (and loads no data) for an unstylable page', async () => {
    const loadData = vi.fn(() => Promise.resolve(DATA));
    const insertCss = vi.fn(() => Promise.resolve());

    const count = await applyCosmetic({ loadData, insertCss }, 3, 'chrome://newtab');

    expect(count).toBe(0);
    expect(loadData).not.toHaveBeenCalled();
    expect(insertCss).not.toHaveBeenCalled();
  });
});

/**
 * `insertCosmeticStyle` runs in the page (B3), so it only touches `window`,
 * `document` and the element API. This suite stubs exactly those to drive it
 * without a browser; the real document_start wiring is covered by
 * `tests/e2e/cosmetic.spec.ts`.
 */
interface FakeStyle {
  id: string;
  textContent: string;
}

interface FakeParent {
  readonly children: FakeStyle[];
  append(node: FakeStyle): void;
}

function makeParent(): FakeParent {
  const children: FakeStyle[] = [];
  return { children, append: (node) => void children.push(node) };
}

function makeDocument(head: FakeParent | null): {
  head: FakeParent | null;
  documentElement: FakeParent;
  createElement: () => FakeStyle;
} {
  return { head, documentElement: makeParent(), createElement: () => ({ id: '', textContent: '' }) };
}

const globals = globalThis as unknown as Record<string, unknown>;

describe('insertCosmeticStyle', () => {
  afterEach(() => {
    delete globals['window'];
    delete globals['document'];
    delete globals['__adblockCosmeticStyle'];
  });

  it('appends the hiding stylesheet only once even if run again', () => {
    const head = makeParent();
    globals['window'] = globalThis;
    globals['document'] = makeDocument(head);

    insertCosmeticStyle('.ad { display: none !important; }');
    insertCosmeticStyle('.ad { display: none !important; }');

    expect(head.children).toHaveLength(1);
    expect(head.children[0]?.id).toBe('adblock-cosmetic-hiding');
    expect(head.children[0]?.textContent).toBe('.ad { display: none !important; }');
  });

  it('falls back to documentElement when there is no head', () => {
    globals['window'] = globalThis;
    const doc = makeDocument(null);
    globals['document'] = doc;

    insertCosmeticStyle('.x { display: none; }');

    expect(doc.documentElement.children).toHaveLength(1);
    expect(doc.documentElement.children[0]?.textContent).toBe('.x { display: none; }');
  });
});
