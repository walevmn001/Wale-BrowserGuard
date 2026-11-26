# Danh sách module

Trạng thái: **IMPLEMENTED / TESTED** cho Phase 1–3; các module Phase 4–7 là SPECIFIED.

Vị trí trong extension: `adblock-spec-kit/src/youtube/`.

## Đã cài đặt (Phase 1–3)

| # | Trách nhiệm | File | Interface | Feature flag | Trạng thái |
|---|-------------|------|-----------|--------------|-----------|
| 1 | JSON Pruner | `core/json-pruner.ts` | `pruneJson(value, adKeys, limits)` | ENABLE_JSON_PRUNER | TESTED |
| 2 | Player Response Hook | `main/player-response-hook.ts` | `installPlayerResponseHook(target, opts)` | ENABLE_JSON_PRUNER | TESTED |
| 3 | Fetch Interceptor | `main/fetch-interceptor.ts` | `createFetchInterceptor(deps).wrap(orig)` | ENABLE_FETCH_HOOK | TESTED |
| 4 | XHR Interceptor | `main/xhr-interceptor.ts` | `createXhrInterceptor(deps).wrap(Ctor)` | ENABLE_XHR_HOOK | TESTED |
| 6 | Ad Detector | `core/ad-detector.ts` | `classifyAd(signals)`, `classifyPlayback(state)` | ENABLE_AD_STATE_MACHINE | TESTED |
| 7 | Ad State Machine | `core/ad-state-machine.ts` | `reduce(state, event, now, max?)` | ENABLE_AD_STATE_MACHINE | TESTED |
| 8 | Ad Action Controller | `core/ad-action-controller.ts` | `performAdAction(target, opts)` | — | TESTED |
| 9 | Audio State Manager | `core/audio-state-manager.ts` | `AudioStateManager` | — | TESTED |
| 14 | Lifecycle Manager | `core/lifecycle-manager.ts` | `add(fn)`, `disposeAll()` | — | TESTED |
| 16 | Debug Logger | `core/debug-logger.ts` | `DebugLogger` | ENABLE_DEBUG_LOGGER | TESTED |
| — | Feature Flag Interface | `config/flags.ts` | `FeatureFlags` (get/applyRemote/snapshot/subscribe/dispose) | — | TESTED |
| — | Adapter boundary | `adapter/adapter.ts`, `adapter/null-adapter.ts` | `FlagAdapter`, `NullAdapter` | — | TESTED |
| — | Registries | `registry/selectors.ts`, `registry/endpoints.ts`, `registry/rules.ts` | `SelectorRegistry`, `EndpointRegistry`, `buildDnrRules` | ENABLE_DNR | TESTED |
| — | Trạng thái popup | `state/toggle-state.ts` | `resolveDisplay(inputs)`, `displayMessage(state)` | — | TESTED |
| — | Module registry | `core/registry.ts` | `ModuleRegistry` | — | TESTED |
| — | Đăng ký MAIN (seam) | `isolated/registration.ts` | `syncEngineRegistration(api, enabled)` | — | TESTED (chưa gọi) |

17 trách nhiệm logic được giữ nguyên ranh giới; các mục **5 (DNR Manager), 10–13 (Watchdog/Recovery/DOM Observer/SPA), 15 (CSS Hider)** thuộc Phase 4–5 và hiện là SPECIFIED. Cấu hình/tuning tập trung ở `config/tuning.ts`.

## Module YouTube cũ (vẫn giữ, KHÔNG xóa)

`src/background/youtube-*.ts` (Q1–Q6), `src/content/youtube/*`, `scripts/youtube-*.ts`, `data/youtube-config.json`. Vẫn là đường chạy hiện hành cho tới khi engine mới được VERIFIED.
