# Danh sách module

Trạng thái: **IMPLEMENTED / TESTED** cho Phase 1–5; các module Phase 6–7 là SPECIFIED.

Vị trí trong extension: `adblock-spec-kit/src/youtube/`.

## Đã cài đặt (Phase 1–5)

| # | Trách nhiệm | File | Interface | Feature flag | Trạng thái |
|---|-------------|------|-----------|--------------|-----------|
| 1 | JSON Pruner | `core/json-pruner.ts` | `pruneJson(value, adKeys, limits)` | ENABLE_JSON_PRUNER | TESTED |
| 2 | Player Response Hook | `main/player-response-hook.ts` | `installPlayerResponseHook(target, opts)` | ENABLE_JSON_PRUNER | TESTED |
| 3 | Fetch Interceptor | `main/fetch-interceptor.ts` | `createFetchInterceptor(deps).wrap(orig)` | ENABLE_FETCH_HOOK | TESTED |
| 4 | XHR Interceptor | `main/xhr-interceptor.ts` | `createXhrInterceptor(deps).wrap(Ctor)` | ENABLE_XHR_HOOK | TESTED |
| 5 | DNR Manager | `core/dnr-manager.ts` | `buildDnrPlan(groups, isProtected, max?)`, `applyDnrPlan(api, next, prev?)` | ENABLE_DNR | TESTED |
| 6 | Ad Detector | `core/ad-detector.ts` | `classifyAd(signals)`, `classifyPlayback(state)` | ENABLE_AD_STATE_MACHINE | TESTED |
| 7 | Ad State Machine | `core/ad-state-machine.ts` | `reduce(state, event, now, max?)` | ENABLE_AD_STATE_MACHINE | TESTED |
| 8 | Ad Action Controller | `core/ad-action-controller.ts` | `performAdAction(target, opts)` | — | TESTED |
| 9 | Audio State Manager | `core/audio-state-manager.ts` | `AudioStateManager` | — | TESTED |
| 10 | Playback Watchdog | `core/playback-watchdog.ts` | `PlaybackWatchdog.attach/sample` | ENABLE_PLAYBACK_WATCHDOG | TESTED |
| 11 | Playback Recovery | `core/playback-recovery.ts` | `PlaybackRecovery.diagnose(input, now)` | ENABLE_RECOVERY | TESTED |
| 12 | DOM Observer | `core/dom-observer.ts` | `DomObserver.observe/disconnect` | ENABLE_DOM_OBSERVER | TESTED |
| 13 | SPA Navigation | `core/spa-navigation.ts` | `SpaNavigationManager.notify/flush` | ENABLE_SPA_NAVIGATION | TESTED |
| 14 | Lifecycle Manager | `core/lifecycle-manager.ts` | `add(fn)`, `disposeAll()` | — | TESTED |
| 15 | CSS Hider | `core/css-hider.ts` | `buildHideCss(selectors)`, `hideSelectors(reg)` | ENABLE_CSS_HIDER | TESTED |
| 16 | Debug Logger | `core/debug-logger.ts` | `DebugLogger` | ENABLE_DEBUG_LOGGER | TESTED |
| — | Timer seam | `core/timers.ts` | `TimerApi`, `realTimers` | — | TESTED |
| — | Runtime wiring | `main/runtime-modules.ts` | `createWatchdogModule/ObserverModule/SpaModule/CssModule` | (theo module) | TESTED |
| — | Feature Flag Interface | `config/flags.ts` | `FeatureFlags` (get/applyRemote/snapshot/subscribe/dispose) | — | TESTED |
| — | Adapter boundary | `adapter/adapter.ts`, `adapter/null-adapter.ts` | `FlagAdapter`, `NullAdapter` | — | TESTED |
| — | Registries | `registry/selectors.ts`, `registry/endpoints.ts`, `registry/rules.ts` | `SelectorRegistry`, `EndpointRegistry`, `buildDnrRules` | ENABLE_DNR | TESTED |
| — | Trạng thái popup | `state/toggle-state.ts` | `resolveDisplay(inputs)`, `displayMessage(state)` | — | TESTED |
| — | Module registry | `core/registry.ts` | `ModuleRegistry` | — | TESTED |
| — | Đăng ký MAIN (seam) | `isolated/registration.ts` | `syncEngineRegistration(api, enabled)` | — | TESTED (chưa gọi) |

17 trách nhiệm logic được giữ nguyên ranh giới; cả 17 đã IMPLEMENTED/TESTED (unit) từ Phase 1–5. Cấu hình/tuning tập trung ở `config/tuning.ts` (`TUNING_VERSION = 3`). Các module Phase 4–5 được nối vào engine ở `main/runtime-modules.ts` và đăng ký trong `main/main.ts`; mỗi module tự-gate theo cờ riêng.

## Module YouTube cũ (vẫn giữ, KHÔNG xóa)

`src/background/youtube-*.ts` (Q1–Q6), `src/content/youtube/*`, `scripts/youtube-*.ts`, `data/youtube-config.json`. Vẫn là đường chạy hiện hành cho tới khi engine mới được VERIFIED.
