# Kiến trúc YT Ad Shield (engine tái triển khai trong WALE GUARD)

Trạng thái: **IMPLEMENTED / TESTED** cho Phase 1–6. Engine đã **TÍCH HỢP / KÍCH HOẠT** (đăng ký động qua `chrome.scripting.registerContentScripts`; T004 đã chốt: thuộc tính `dataset`). Chưa **VERIFIED** trên Chrome thật.

## 1. Quyết định phạm vi (đã chốt với người dùng)

Spec-kit `yt-ad-shield` mô tả một extension pure-JS/no-bundler độc lập. Kho chứa thực tế là extension **WALE GUARD (TypeScript + Vite)**. Hai điều này xung đột, nên đã chốt:

- Engine tái triển khai được **tích hợp vào extension hiện có** dưới dạng module TS, giữ nguyên build TS+Vite.
- Chỉ sửa **SHARED ở mức tối thiểu, backward-compatible**.
- Cơ chế nạp MAIN sớm dùng `chrome.scripting.registerContentScripts` (`world: 'MAIN'`, `runAt: 'document_start'`).
- Engine mới **thay trọn vai trò** module YouTube v1 cũ: đường `executeScript` prune/skip/health cũ đã ngừng gọi (module v1 còn trong mã nguồn nhưng không còn caller production).
- Engine **được kích hoạt theo công tắc module** (theo bật/tắt qua `registerContentScripts`/`unregisterContentScripts`), không cần khai báo tĩnh trong manifest.

## 2. Hai world

```
ISOLATED (service worker / content script)          MAIN (trang YouTube)
  chrome.storage, chrome.scripting                   window.fetch, XMLHttpRequest,
  src/background/youtube-*.ts                        JSON.parse, ytInitialPlayerResponse
        │                                                     ▲
        │  registerContentScripts('youtube-main.js',          │
        │      world:'MAIN') + ('youtube-isolated.js',        │
        │      world:'ISOLATED')                              │
        └──────────── src/youtube/isolated/registration.ts ───┘
        │                                                     │
  youtube-isolated.js: settings → dataset.publish()          │
        │   ghi attribute data-wg-yt-flags trên <html>        │
        └───────────────────────────────────────────► youtube-main.js (content-entry.ts)
                                                              │
                                                     bootYouTubeEngine()  → ModuleRegistry
                                                       DatasetAdapter.onReceive → applyRemote
```

- Cấu phần **thuần logic** (`core/`, `config/`, `registry/`, `adapter/`, `state/`) không được chạm `window`/`document`/`chrome`; ràng buộc này được **kiểm tra bằng test** (`tests/unit/youtube/architecture.test.ts`).
- Chỉ `src/youtube/main/*` chạm biến toàn cục của trang, và nhận dependency qua tham số để unit-test được trong Node.

## 3. Đường ống engine (main)

```
content-entry.ts → bootYouTubeEngine(win)
   FeatureFlags (12 cờ, mặc định BẬT theo A-3)  ← T004 đã chốt: DatasetAdapter (thuộc tính data-wg-yt-flags)
   DebugLogger (tắt mặc định), LifecycleManager
   registry: selectors, endpoints
   ModuleRegistry:
     json-pruner        → installPlayerResponseHook  (ENABLE_JSON_PRUNER)
     fetch-interceptor  → wrap(win.fetch)            (ENABLE_FETCH_HOOK)
     xhr-interceptor    → wrap(win.XMLHttpRequest)   (ENABLE_XHR_HOOK)
     playback-watchdog  → sample video mỗi 1s (+ recovery) (ENABLE_PLAYBACK_WATCHDOG / ENABLE_RECOVERY)
     dom-observer       → MutationObserver player, debounce    (ENABLE_DOM_OBSERVER)
     spa-navigation     → yt-navigate-finish / popstate, debounce (ENABLE_SPA_NAVIGATION)
     css-hider          → 1 <style> ẩn ad chrome                (ENABLE_CSS_HIDER)
     ad-control         → skip / fast-forward parity module cũ (ENABLE_AD_STATE_MACHINE)
   lifecycle/registry dispose gỡ mọi hook (idempotent)
```

- Quyết định logic thuần ở `core/`: `playback-watchdog` (phát hiện stall), `playback-recovery` (chọn cấp tối thiểu), `dom-observer` (debounce), `spa-navigation` (debounce + phát hiện đổi tham chiếu), `dnr-manager` (planner + rollback), `css-hider` (builder chuỗi CSS).
- `main/runtime-modules.ts` là **nơi duy nhất** module Phase 4–5 chạm trang: nó đọc `#movie_player`/`video`, gắn timer/observer và thực hiện hai ghi được phép (nudge `currentTime = currentTime` khi recovery NUDGE; chèn `<style>`).
- Time seam (`core/timers.ts`, `TimerApi`) cho phép debounce dùng đồng hồ giả khi test → world-independent.

## 4. Ranh giới cờ MAIN/ISOLATED (T004 đã chốt)

- Cờ đọc qua `FeatureFlags` (`src/youtube/config/flags.ts`) — world-independent, hợp đồng ở `contracts/feature-flags.md`.
- Truyền cờ sang MAIN qua adapter (`src/youtube/adapter/`). **T004 đã chốt = phương án A: thuộc tính `dataset`** — `DatasetAdapter` (`src/youtube/adapter/dataset-adapter.ts`) ghi/đọc một attribute JSON `data-wg-yt-flags` trên `document.documentElement`. `NullAdapter` vẫn giữ làm adapter trung tính cho test.
- ISOLATED phía ghi: `src/youtube/isolated/content-entry.ts` (`youtube-isolated.js`) đọc `desiredFlags()` và `publish()` snapshot; MAIN phía đọc: `main/main.ts` qua `DatasetAdapter.onReceive → FeatureFlags.applyRemote`, đồng thời `MutationObserver` chờ root nếu `<html>` chưa có.
- Chỉ ba cờ MAIN phụ thuộc adapter (`ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK`, `ENABLE_XHR_HOOK`). Module ISOLATED không cần adapter.
- **A-2 và A-4 vẫn UNVERIFIED**; phương án A được chọn vì đọc đồng bộ được ngay và không thêm quyền. Thứ tự chạy hai world vẫn cần đo (A-4), nhưng thiết kế chịu được cả hai thứ tự: MAIN giữ mặc định A-3 (bật) cho tới khi nhận snapshot.

## 5. Bảo toàn playback (ưu tiên cao nhất)

- Mọi interceptor **fail-open**: lỗi → trả nguyên `Response`/đối tượng gốc, không bao giờ ném ra trang.
- Fetch chỉ đọc body qua `response.clone()` (**không tiêu thụ body gốc**), chỉ ghi đè khi thực sự có khóa quảng cáo và URL là player; giữ `status`/`statusText`/`headers`/`url`; có timeout.
- XHR không đổi `responseType`/`status`; chỉ sửa `responseText`/`response` cho player endpoint.
- JSON pruner **không bao giờ xóa** khóa playback (`streamingData`, `videoDetails`, `captions`, `playabilityStatus`, `playerConfig`) và tôn trọng `maxDepth`/`maxKeys`.
- Ad Action Controller chỉ seek khi `duration` hữu hạn và > 0, tôn trọng `maxAttempts`, ưu tiên skip; Audio State Manager chỉ đổi `muted` (không đổi `volume`) và chỉ khôi phục khi chính nó đã mute.
- Playback Watchdog **chỉ đọc** `currentTime`/`readyState`/`error`; không bao giờ tự seek/reload; listener dùng `WeakSet` chống trùng; stall/error được latch chỉ báo một lần.
- Playback Recovery chọn cấp **tối thiểu**: ad đang chạy / pause / end / media-error → không chạm media; buffering / thiếu buffer → WAIT; chỉ stall thật mới RESYNC (cấp 2) rồi NUDGE một lần (cấp 3, `currentTime = currentTime`, có cooldown); nghi ngờ lỗi engine (FR-036) → không chạm media và khuyến nghị DISABLED.
- DOM Observer và SPA Navigation gộp burst mutation/navigation bằng debounce và **không** mutate DOM mà nó quan sát; `disconnect`/`dispose` idempotent.
- DNR Manager kiểm id trùng, chặn rule quá trần (`dnrMaxRules`), từ chối rule chứa endpoint được bảo vệ, và **rollback** về rule cũ nếu áp dụng thất bại.

## 6. Kích hoạt (đã bật qua công tắc module)

`src/youtube/isolated/registration.ts` cung cấp `syncEngineRegistration(api, enabled)` (idempotent, fail-open), **đã được gọi** từ worker: `src/background/service-worker.ts` (`applyYouTubeEngineRegistration`) đăng ký/huỷ đăng ký động cả `youtube-main.js` (MAIN) và `youtube-isolated.js` (ISOLATED) theo công tắc module (`createYouTubeModuleSettings().isEnabled()`) VÀ effective config (`loadEffectiveYouTubeConfig()?.enabled`, kill-switch Q6). Vì dùng đăng ký động nên `manifest.json` **không** có `content_scripts` cho engine, và tắt module sẽ gỡ injection mà không cần reload. Popup phản ánh trạng thái thật: 3 cờ MAIN hiển thị `ENABLED`/`DISABLED` khi engine đã đăng ký (`isEngineRegistered` → READY), ngược lại `WAITING_FOR_ADAPTER`. Việc xác nhận hành vi chặn thật vẫn thuộc Phase 7 (chưa VERIFIED).
