# Danh sách module

Trạng thái: **IMPLEMENTED / TESTED** cho Phase 1–6 + **CHECKPOINT FIX-01**; các module Phase 7 là SPECIFIED.

Vị trí trong extension: `adblock-spec-kit/src/youtube/`.

## Đã cài đặt (Phase 1–6)

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
| — | Trạng thái popup | `state/toggle-state.ts` | `resolveDisplay(inputs)` | — | TESTED |
| — | Module registry | `core/registry.ts` | `ModuleRegistry` | — | TESTED |
| — | Đăng ký MAIN (seam) | `isolated/registration.ts` | `syncEngineRegistration(api, enabled)` | — | TESTED (chưa gọi) |
| — | Nhóm layer hiển thị | `config/layers.ts` | `MAIN_LAYERS`, `ISOLATED_LAYERS`, `isMainFlag(flag)` | — | TESTED |
| — | Thông điệp popup | `state/messages.ts` | `DISPLAY_LABELS`, `displayMessage(state, reason?)`, `hasForbiddenMainPhrase(text)` | — | TESTED |
| — | Lưu cấu hình layer (ISOLATED) | `isolated/settings.ts` | `YouTubeEngineSettings` (khóa `youtubeEngineFlags`) | — | TESTED |
| — | Dựng row cho popup | `popup/yt-layers.ts` | `buildYtLayers(desired, adapter, snapshot, engine)`, `mainGroupState(rows)` | — | TESTED |
| — | Trạng thái runtime (MAIN→popup) | `state/runtime-status.ts` | `buildRuntimeStatus`, `isYtRuntimeStatus`, `isStatusFresh`, `HOOK_MODULE_BY_FLAG` | — | TESTED |
| — | Phát status (MAIN) | `main/status-publisher.ts` | `createStatusPublisher(deps).publish()` | — | TESTED |
| — | Lưu status per-tab | `background/youtube-status-store.ts` | `YtStatusStore.save/read/clear` (khóa `wgYtStatus:<tabId>`) | — | TESTED |

17 trách nhiệm logic được giữ nguyên ranh giới; cả 17 đã IMPLEMENTED/TESTED (unit) từ Phase 1–5. Cấu hình/tuning tập trung ở `config/tuning.ts` (`TUNING_VERSION = 4`). Các module Phase 4–5 được nối vào engine ở `main/runtime-modules.ts` và đăng ký trong `main/main.ts`; mỗi module tự-gate theo cờ riêng; engine còn nối thêm module `ad-control` (`main/ad-control-module.ts`). Phase 6 nối popup: `popup/yt-layers.ts` dựng 6 row (3 MAIN + 3 ISOLATED); lựa chọn lưu ở `chrome.storage.sync` qua `isolated/settings.ts`.

**CHECKPOINT FIX-01:** nhóm MAIN không còn suy `READY` từ registration đơn thuần. `main/main.ts` đảo thứ tự (cấu hình an toàn → nhận snapshot → `initAll`) và hook đăng ký lại theo `flags.subscribe` (per-call gate). MAIN phát trạng thái runtime (`main/status-publisher.ts` → `data-wg-yt-status`), ISOLATED relay (`isolated/content-entry.ts` → `MSG_YT_STATUS`), worker lưu per-tab (`background/youtube-status-store.ts`), popup đọc để phân giải qua `resolveLayerDisplay` (`state/toggle-state.ts`) → 8 trạng thái; `READY` (`ENABLED`) chỉ khi trang xác nhận `enabled && installed`.

## Module YouTube cũ (đã retire khỏi production, KHÔNG xóa)

`src/background/youtube-*.ts` (Q1–Q6), `src/content/youtube/*`, `scripts/youtube-*.ts`, `data/youtube-config.json`. Không còn là đường chạy production: engine mới đăng ký động qua `chrome.scripting.registerContentScripts` và thay trọn vai trò; đường `executeScript` prune/skip/health của v1 đã ngừng gọi (không còn caller `createYouTubeModule`/`runYouTubeModule` trong `src/`). File được giữ lại cùng unit test cũ.
