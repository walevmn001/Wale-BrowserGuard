# Changelog

All notable changes to WALE GUARD (AdBlock Security) are recorded here. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-11-27

### Added

- YouTube ad-shield engine (spec-kit `yt-ad-shield`) is now **integrated and
  activated** in WALE GUARD. Phase 0–6 implemented and unit-tested; the engine
  registers its MAIN + ISOLATED content scripts dynamically via
  `chrome.scripting.registerContentScripts`, toggled by the module switch.
- `DatasetAdapter` (T004, option A): the ISOLATED world publishes the flag
  snapshot into the `data-wg-yt-flags` attribute on `<html>`; the MAIN world
  reads it once and via `MutationObserver`. The three MAIN flags
  (`ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK`, `ENABLE_XHR_HOOK`) can now be
  toggled from the popup (`READY` once registered).

### Changed

- The legacy YouTube module (v1, `src/background/youtube-*.ts`) is retired from
  production: the prune/skip/health `executeScript` path is no longer called.
  The source and its unit tests are kept.
- Build now runs three Vite passes, adding `dist/youtube-isolated.js` next to
  `dist/youtube-main.js`; `npm run package` zips both engine bundles (release
  plugin moved to the final pass so the ZIP is complete).

### Notes

- Real-Chrome validation (Phase 7) is still **pending** — ad-blocking behaviour
  is **not yet VERIFIED** on real YouTube/Chrome. Details:
  `spec-kit-updates/yt-ad-shield/docs/CHANGELOG.md`.

## [1.1.1] — 2026-11-22

### Fixed

- Make the installed-extension scan tolerate missing permission metadata returned
  by the browser management API.

### Changed

- Bundle Inter locally, including Vietnamese glyphs, so the UI uses the same font
  across devices without fetching remote assets.

## [1.1.0] — 2026-11-22

### Added

- **YouTube module (opt-in, off by default).** A separate, isolated switch in the
  options page turns on a best-effort YouTube layer: hide the ad fields in the
  player response (Q2, MAIN world), hide ad containers with CSS (Q3), skip /
  fast-forward ads (Q4, MAIN world), and auto-degrade if it keeps breaking
  playback (Q5). Selectors, endpoints and ad-field names are **data**
  (`data/youtube-config.json`), refreshed via the config updater (Q6) with a
  kill-switch. Every MAIN-world script is fail-open and never sends page data
  anywhere. The module shows a clear risk warning before you enable it.
- **Advanced page with optional features (P6):**
  - Installed-extension risk scan — lists your other extensions with a risk
    score. Requests the `management` permission **only when you press Scan**, and
    never disables or removes anything.
  - Optional settings sync — stores your **configuration only** (settings,
    whitelist, custom hidden selectors) through your browser's own sync account.
    Off by default; statistics, activity log and history are never synced.
- **Notifications** (local desktop notifications for filter updates, security
  blocks and YouTube auto-degrade), off by default per kind.

## [1.0.2] — 2026-11-21

### Changed

- Widened the tracker list: 11 vendor hosts (Yandex, Bing, Yahoo, Meta, Reddit,
  Snapchat, LinkedIn pixels/analytics) as sub-resource block rules, plus 14
  `||<prefix>.$third-party` prefix rules. Added a golden guard for 36 benign
  hosts that must never be blocked.

## [1.0.1] — 2026-11-21

### Changed

- First "B2b" coverage pass: 14 `||<prefix>.$third-party` rules
  (`ads`, `ad`, `adserver`, `adx`, `analytics`, `metrics`, `telemetry`,
  `tracking`, `tracker`, `pixel`, `trk`, `events`, `stats`, `beacon`).

## [1.0.0] — 2026-11-21

### Added

- First public release (Chromium / Edge / Brave, Manifest V3).
- Network blocking via `declarativeNetRequest` (ads, trackers, malware).
- Cosmetic element hiding; malicious/phishing warning page.
- Optional privacy protections (all off by default): HTTPS upgrade, tracking-
  parameter stripping, Referer trimming, WebRTC IP handling, basic
  anti-fingerprinting.
- Local-only statistics (per-tab and total), whitelist, per-site pause, profiles,
  custom rules, element picker, import/export.
- Bilingual UI (English / Tiếng Việt).
