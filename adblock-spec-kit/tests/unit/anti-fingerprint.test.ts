import { afterEach, describe, expect, it, vi } from 'vitest';

import { antiFingerprintApplies, installAntiFingerprint } from '../../src/content/anti-fingerprint';

/**
 * `installAntiFingerprint` runs in the page's MAIN world, so it only touches
 * `window`, `Object` and literals. This suite stubs `window` (with a fake
 * `navigator` and the WebGL constructors) to drive the spoofs deterministically
 * without a browser. Real MAIN-world injection is covered by
 * `tests/e2e/anti-fingerprint.spec.ts`.
 */

interface FakeWebgl {
  readonly ctor: { prototype: Record<string, unknown> };
  readonly calls: number[];
}

function makeWebgl(): FakeWebgl {
  const calls: number[] = [];
  // The page global is a *function* whose prototype carries `getParameter`,
  // mirroring the real `WebGLRenderingContext`.
  const ctor = function Webgl(): void {};
  (ctor as unknown as { prototype: Record<string, unknown> }).prototype = {
    getParameter(this: unknown, parameter: number): string {
      calls.push(parameter);
      return `real:${parameter}`;
    },
  };
  return { ctor: ctor as unknown as FakeWebgl['ctor'], calls };
}

interface StubbedWindow {
  readonly nav: Record<string, unknown>;
  readonly webgl: FakeWebgl;
  readonly webgl2: FakeWebgl;
  readonly win: Record<string, unknown>;
}

function stubWindow(extra: Record<string, unknown> = {}): StubbedWindow {
  const nav: Record<string, unknown> = {};
  const webgl = makeWebgl();
  const webgl2 = makeWebgl();
  const win: Record<string, unknown> = {
    navigator: nav,
    WebGLRenderingContext: webgl.ctor,
    WebGL2RenderingContext: webgl2.ctor,
    ...extra,
  };
  vi.stubGlobal('window', win);
  return { nav, webgl, webgl2, win };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('antiFingerprintApplies', () => {
  it('is off unless the global opt-in is set (AC-6.5 defaults off)', () => {
    expect(antiFingerprintApplies({ enabled: false, offSites: [] }, 'example.org')).toBe(false);
  });

  it('runs when enabled and the host is not switched off', () => {
    expect(antiFingerprintApplies({ enabled: true, offSites: [] }, 'example.org')).toBe(true);
  });

  it('is skipped for a host on the per-page off list', () => {
    const settings = { enabled: true, offSites: ['example.org'] };
    expect(antiFingerprintApplies(settings, 'example.org')).toBe(false);
    expect(antiFingerprintApplies(settings, 'other.org')).toBe(true);
  });
});

describe('installAntiFingerprint', () => {
  it('reports a coarse hardware profile instead of the real one', () => {
    const { nav } = stubWindow();

    installAntiFingerprint();

    expect(nav['hardwareConcurrency']).toBe(2);
    expect(nav['deviceMemory']).toBe(4);
    expect(nav['plugins']).toEqual([]);
    expect(nav['mimeTypes']).toEqual([]);
  });

  it('spoofs the WebGL adapter strings but forwards every other parameter', () => {
    const { webgl, webgl2 } = stubWindow();

    installAntiFingerprint();

    const getParameter = webgl.ctor.prototype['getParameter'] as (value: number) => string;
    expect(getParameter(0x9245)).toBe('Google Inc.');
    expect(getParameter(0x9246)).toContain('SwiftShader');
    expect(getParameter(0x1234)).toBe('real:4660');
    expect(webgl.calls).toEqual([0x1234]);

    const getParameter2 = webgl2.ctor.prototype['getParameter'] as (value: number) => string;
    expect(getParameter2(0x9245)).toBe('Google Inc.');
    expect(webgl2.calls).toEqual([]);
  });

  it('installs once: a second call leaves the wrappers untouched', () => {
    const { webgl } = stubWindow();

    installAntiFingerprint();
    const first = webgl.ctor.prototype['getParameter'];
    installAntiFingerprint();

    expect(webgl.ctor.prototype['getParameter']).toBe(first);
  });

  it('never throws when the page lacks the objects it would spoof', () => {
    vi.stubGlobal('window', {});

    expect(() => installAntiFingerprint()).not.toThrow();
  });
});
