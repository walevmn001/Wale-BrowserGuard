# Considering a Firefox port (T092)

Status: **decision — defer the port; keep the codebase portable.** Chromium
(Chrome / Edge / Brave) stays the v1 target, as fixed in Constitution #1. This
document records what a Firefox build would take, grounded in the official MDN
documentation, so the work is scoped and can be picked up in a later phase.

> This task (T092) revisits the earlier scoping note now that the **YouTube
> module** exists: Firefox's stronger network APIs would make that module
> *easier*, not harder (see [The YouTube module on Firefox](#the-youtube-module-on-firefox)).

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

## The YouTube module on Firefox

Our YouTube module (P5) works around Chrome's limits: Chrome removed blocking
`webRequest` for MV3 extensions, so the ad-field pruning (Q2) and ad-skip (Q4)
run as **MAIN-world page scripts** that hook `ytInitialPlayerResponse` /
`JSON.parse` — powerful but fragile, and it is exactly the pattern Chrome Web
Store policy is most wary of (see T093). Firefox does not have that limitation,
which makes the port *easier* on the module that is hardest on Chrome.

| Concern | Chrome (current) | Firefox (MV3) | Source |
|---------|------------------|---------------|--------|
| Blocking / rewriting requests | blocking `webRequest` removed in MV3; we use DNR for block, MAIN world for the rest | keeps **both** blocking `webRequest` **and** `declarativeNetRequest` | [Mozilla blog: MV3 in Firefox](https://blog.mozilla.org/addons/2025/02/25/manifest-v3-in-firefox/) |
| Rewriting a response body | not possible from an extension; we hook `JSON.parse`/`Response.json` in the page | **`webRequest.filterResponseData()`** streams the response so the extension can read and rewrite the body — the ad fields could be stripped at the network layer (Q2) instead of via the fragile MAIN-world hook | [MDN: filterResponseData](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/filterResponseData) |
| Permission for the above | — | MV3 also needs `webRequestFilterResponse` (from Firefox 110) | [MDN: filterResponseData](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/filterResponseData) |
| MAIN-world page scripts | `world: "MAIN"` via `chrome.scripting` | `world: "MAIN"` supported since **Firefox 128**, and injected with the `browser.scripting` namespace (MAIN-world scripts get **no** WebExtension API) | [MDN: content_scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts), [Firefox 128 release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/128) |

Consequences for the port:

- **Q2 (hide ad fields)** could move from the MAIN-world `JSON.parse` hook to a
  `filterResponseData` rewrite of the player response — fewer moving parts, and
  robust against YouTube renaming page globals. This is the main *win*.
- **Q1 (network block)** already uses DNR, which Firefox supports since 113; the
  blocking-`webRequest` fallback exists if a rule needs per-request logic.
- **Q4 (skip / fast-forward)** is DOM/`<video>` work with no network angle, so it
  ports unchanged (still MAIN world, still fail-open).
- The optional-permission and fail-open rules (Constitution VI) carry over
  as-is; `filterResponseData` requires its own opt-in permission, which fits the
  same "ask only when the user enables the module" model.

Net: the YouTube module — the most Chrome-fragile part of the codebase — would
get **simpler and more robust** on Firefox, which strengthens the case for doing
the port in a future phase.

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
6. **Simplify the YouTube module.** On Firefox, move Q2's ad-field pruning to a
   `filterResponseData` rewrite (behind the module's opt-in flag) instead of the
   MAIN-world `JSON.parse` hook; keep the MAIN-world path for Chrome. Q1 DNR and
   Q4 DOM logic port unchanged.

## Recommendation

Ship **Chromium-first** for v1. The gaps above are real but contained; step 1
(the `browser` adapter) is worth doing opportunistically because it costs little
on Chrome and is the prerequisite for everything else. The YouTube module is an
argument *for* the port rather than against it: Firefox's `filterResponseData`
lets us strip the ad fields at the network layer, removing the most fragile part
of the Chrome implementation. Track the full port as a new task in a later phase
rather than folding it into P7.
