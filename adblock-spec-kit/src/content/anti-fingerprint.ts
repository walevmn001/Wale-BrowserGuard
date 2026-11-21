/**
 * Basic anti-fingerprinting — T036 (spec AC-6.5, algorithm.md §G).
 *
 * Opt-in and **off by default** (clarify.md #9): trimming the surface a page
 * can read is the surest way to break a site, so nothing runs until the user
 * switches it on, and a per-host switch lets them turn it off again for any
 * single site (the popup's quick toggle).
 *
 * `installAntiFingerprint` runs inside the page's **MAIN world** via
 * `chrome.scripting.executeScript({ world: 'MAIN' })` — only there can it
 * shadow the page's own `navigator`/WebGL objects. Like the cosmetic observer,
 * the function is serialised with `Function.prototype.toString()`, so it must
 * be **self-contained**: parameters and page globals only, no imports and no
 * closure over module scope.
 *
 * Scope: a conservative "basic" reduction (coarse hardware counts, the
 * plugin/mime enumeration and the WebGL adapter strings). Deliberately gentle —
 * "under-block beats over-block" (project rule): it spoofs *toward* a common
 * value rather than randomising, so it never makes a page render differently.
 */

/** The stored anti-fingerprinting choice plus the hosts it is switched off on. */
export interface AntiFingerprintSettings {
  /** Global opt-in. `false` means the protection never runs (the default). */
  readonly enabled: boolean;
  /** Hosts where the user turned the protection off — the per-page switch. */
  readonly offSites: readonly string[];
}

/** Whether the protection should run for `host` (AC-6.5). */
export function antiFingerprintApplies(settings: AntiFingerprintSettings, host: string): boolean {
  return settings.enabled && !settings.offSites.includes(host);
}

/**
 * Reduces the page's basic fingerprint surface. Self-contained: it is injected
 * into the page's MAIN world and serialised, so it only touches `window` and
 * literals.
 */
export function installAntiFingerprint(): void {
  const scope = window as unknown as Record<string, unknown>;
  if (scope['__adblockAntiFingerprint'] === true) {
    return;
  }
  scope['__adblockAntiFingerprint'] = true;

  /** Shadows a property with a fixed value; a locked one is skipped, never thrown. */
  const defineValue = (target: unknown, property: string, value: unknown): void => {
    if (typeof target !== 'object' || target === null) {
      return;
    }
    try {
      Object.defineProperty(target, property, {
        configurable: true,
        enumerable: false,
        get: () => value,
      });
    } catch {
      // A non-configurable property is left untouched.
    }
  };

  // Report a common, low-detail hardware profile instead of the real one.
  const nav = scope['navigator'];
  defineValue(nav, 'hardwareConcurrency', 2);
  defineValue(nav, 'deviceMemory', 4);
  defineValue(nav, 'plugins', []);
  defineValue(nav, 'mimeTypes', []);

  // Report a generic GPU so WebGL cannot name the real adapter.
  const spoofWebgl = (constructor: unknown): void => {
    const prototype =
      typeof constructor === 'function'
        ? (constructor as { prototype?: Record<string, unknown> }).prototype
        : undefined;
    const original = prototype?.['getParameter'];
    if (prototype === undefined || typeof original !== 'function') {
      return;
    }
    try {
      prototype['getParameter'] = function (this: unknown, parameter: number): unknown {
        if (parameter === 0x9245) {
          return 'Google Inc.';
        }
        if (parameter === 0x9246) {
          return 'ANGLE (Google, Vulkan 1.1.0 (SwiftShader Device))';
        }
        return (original as (this: unknown, value: number) => unknown).call(this, parameter);
      };
    } catch {
      // A frozen prototype is skipped.
    }
  };
  spoofWebgl(scope['WebGLRenderingContext']);
  spoofWebgl(scope['WebGL2RenderingContext']);
}
