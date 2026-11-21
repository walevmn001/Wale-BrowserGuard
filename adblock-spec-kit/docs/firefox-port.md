# Considering a Firefox port (T042)

Status: **decision — defer the port; keep the codebase portable.** Chromium
(Chrome / Edge / Brave) stays the v1 target, as fixed in Constitution #1. This
document records what a Firefox build would take, grounded in the official MDN
documentation, so the work is scoped and can be picked up in a later phase.

> Scope note: this task is a *consideration*, not the port itself. Nothing here
> ships a Firefox build.

## Where we stand

The extension is Manifest V3 and already keeps most of its logic in portable
modules:

- **Rules are data.** `scripts/build-rules.ts` emits DNR JSON; the runtime never
  parses filter syntax. DNR itself is cross-browser.
- **No remote code, no `eval`** (Constitution #7, #8) — nothing Firefox would
  reject on security grounds.
- **State lives in `chrome.storage`** through one wrapper (`TypedStorage`), which
  is the single place a Firefox namespace change would need to be absorbed.
- **UI is plain HTML + TS**, no framework.

The build (Vite) and tests (Vitest / Playwright) would carry over; only the
manifest and the browser-API surface differ.

## Documented differences that block a straight reuse

| Area | Chrome (current) | Firefox (MV3) | Source |
|------|------------------|---------------|--------|
| Background | `background.service_worker` (module) | `background.scripts` — an **event page**, not a service worker; Firefox only supports `scripts` | [MDN: background](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) |
| API namespace | `chrome.*` returns promises in MV3 | `browser.*` is promise-based; the `chrome.*` namespace is callback-based | [MDN: Chrome incompatibilities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Chrome_incompatibilities) |
| Block counting | `declarativeNetRequest.getMatchedRules()` drives the popup stats (T015) | **`getMatchedRules` is not implemented in Firefox** — the whole feature needs a different source | [MDN: getMatchedRules](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/getMatchedRules) |
| Static rule budget | `GUARANTEED_MINIMUM_STATIC_RULES` = 30000 | supported but the guaranteed value is browser-defined; use `getAvailableStaticRuleCount()` rather than assuming 30000 | [MDN: GUARANTEED_MINIMUM_STATIC_RULES](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/GUARANTEED_MINIMUM_STATIC_RULES) |
| Extension id | fixed by `key` in the manifest | ignores `key`; id comes from `browser_specific_settings.gecko.id` — the absolute `chrome-extension://…` malware redirect URL (T031) breaks | [MDN: manifest key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) |
| DNR availability | since Chrome 84 | since **Firefox 113** | [MDN: declarativeNetRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest) |

Unknowns still to confirm against the current docs when the port starts
(marked `TODO(verify)` — do not assume):

- `background.type: "module"` support for Firefox event pages (our worker is an
  ES module that imports shared chunks).
- The object form of `web_accessible_resources` in Firefox MV3.
- `privacy.*` equivalents for the opt-in WebRTC IP-handling policy (T035) and the
  per-site behavior of the anti-fingerprinting MAIN-world script (T036).
- Whether Firefox's retained **blocking `webRequest`** is the best replacement
  for the `getMatchedRules`-based stats, or whether a simpler in-page counter is
  cleaner.

## Recommended approach (when we do port)

1. **Introduce a thin `browser` adapter** so features call one promise-based
   namespace, resolved to `globalThis.browser ?? globalThis.chrome`. That keeps
   Chrome working and makes Firefox promise-based calls correct. This is the
   single highest-value refactor and is low-risk on Chrome.
2. **Second manifest target.** Generate `manifest.firefox.json` (background
   `scripts`, `browser_specific_settings.gecko.id`, drop `key`) alongside the
   existing Chrome manifest from the same typed source.
3. **Rework stats for Firefox.** `getMatchedRules` is unavailable, so the popup's
   per-tab/total counts need an alternative source; keep the counter module
   backend-agnostic behind the adapter.
4. **Guard the malware redirect id** — the absolute `chrome-extension://` URL is
   Chrome-specific; derive the warning-page URL from `browser.runtime.getURL()`.
5. **Re-run the golden and e2e suites** against Firefox via Playwright's Firefox
   build to prove parity (AC-1.1…AC-1.5).

## Recommendation

Ship **Chromium-first** for v1. The gaps above are real but contained; step 1
(the `browser` adapter) is worth doing opportunistically because it costs little
on Chrome and is the prerequisite for everything else. Track the full port as a
new task in a later phase rather than folding it into P4.
