# Kiến trúc YT Ad Shield (engine tái triển khai trong WALE GUARD)

Trạng thái: **IMPLEMENTED / TESTED** cho Phase 1–3. Chưa **VERIFIED** trên Chrome thật.

## 1. Quyết định phạm vi (đã chốt với người dùng)

Spec-kit `yt-ad-shield` mô tả một extension pure-JS/no-bundler độc lập. Kho chứa thực tế là extension **WALE GUARD (TypeScript + Vite)**. Hai điều này xung đột, nên đã chốt:

- Engine tái triển khai được **tích hợp vào extension hiện có** dưới dạng module TS, giữ nguyên build TS+Vite.
- Chỉ sửa **SHARED ở mức tối thiểu, backward-compatible**.
- Cơ chế nạp MAIN sớm dùng `chrome.scripting.registerContentScripts` (`world: 'MAIN'`, `runAt: 'document_start'`).
- **Không xóa / không thay thế** module YouTube hiện có; engine mới chạy song song và **chưa được kích hoạt** cho tới khi kiểm thử Chrome thật ở Phase 7.

## 2. Hai world

```
ISOLATED (service worker / content script)          MAIN (trang YouTube)
  chrome.storage, chrome.scripting                   window.fetch, XMLHttpRequest,
  src/background/youtube-*.ts (module cũ Q1–Q6)      JSON.parse, ytInitialPlayerResponse
        │                                                     ▲
        │  registerContentScripts('youtube-main.js')           │
        └──────────── src/youtube/isolated/registration.ts ───┘
                                                     src/youtube/main/content-entry.ts
                                                              │
                                                     bootYouTubeEngine()  → ModuleRegistry
```

- Cấu phần **thuần logic** (`core/`, `config/`, `registry/`, `adapter/`, `state/`) không được chạm `window`/`document`/`chrome`; ràng buộc này được **kiểm tra bằng test** (`tests/unit/youtube/architecture.test.ts`).
- Chỉ `src/youtube/main/*` chạm biến toàn cục của trang, và nhận dependency qua tham số để unit-test được trong Node.

## 3. Đường ống engine (main)

```
content-entry.ts → bootYouTubeEngine(win)
   FeatureFlags (12 cờ, mặc định BẬT theo A-3)  ← T004 OPEN: chưa có adapter thật, dùng NullAdapter
   DebugLogger (tắt mặc định), LifecycleManager
   registry: selectors, endpoints
   ModuleRegistry:
     json-pruner        → installPlayerResponseHook  (ENABLE_JSON_PRUNER)
     fetch-interceptor  → wrap(win.fetch)            (ENABLE_FETCH_HOOK)
     xhr-interceptor    → wrap(win.XMLHttpRequest)   (ENABLE_XHR_HOOK)
   lifecycle/registry dispose gỡ mọi hook (idempotent)
```

## 4. Ranh giới cờ MAIN/ISOLATED (T004 vẫn OPEN)

- Cờ đọc qua `FeatureFlags` (`src/youtube/config/flags.ts`) — world-independent, hợp đồng ở `contracts/feature-flags.md`.
- Truyền cờ sang MAIN qua adapter (`src/youtube/adapter/`). Hiện là **NullAdapter** (`name = "null"`), trạng thái `WAITING`.
- Chỉ ba cờ MAIN phụ thuộc adapter (`ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK`, `ENABLE_XHR_HOOK`). Module ISOLATED không cần adapter.
- Chưa chọn cơ chế truyền (A/B/C ở `contracts/adapter.md` mục 6). **A-2 và A-4 vẫn UNVERIFIED.**

## 5. Bảo toàn playback (ưu tiên cao nhất)

- Mọi interceptor **fail-open**: lỗi → trả nguyên `Response`/đối tượng gốc, không bao giờ ném ra trang.
- Fetch chỉ đọc body qua `response.clone()` (**không tiêu thụ body gốc**), chỉ ghi đè khi thực sự có khóa quảng cáo và URL là player; giữ `status`/`statusText`/`headers`/`url`; có timeout.
- XHR không đổi `responseType`/`status`; chỉ sửa `responseText`/`response` cho player endpoint.
- JSON pruner **không bao giờ xóa** khóa playback (`streamingData`, `videoDetails`, `captions`, `playabilityStatus`, `playerConfig`) và tôn trọng `maxDepth`/`maxKeys`.
- Ad Action Controller chỉ seek khi `duration` hữu hạn và > 0, tôn trọng `maxAttempts`, ưu tiên skip; Audio State Manager chỉ đổi `muted` (không đổi `volume`) và chỉ khôi phục khi chính nó đã mute.

## 6. Kích hoạt (chưa bật)

`src/youtube/isolated/registration.ts` cung cấp `syncEngineRegistration(api, enabled)` (idempotent, fail-open) nhưng **chưa được gọi** từ worker. Việc bật engine là bước Phase 5–6, chỉ sau khi Phase 4–7 hoàn tất và có bằng chứng Chrome thật. Khi chưa bật, **không thay đổi hành vi hiện tại của extension**.
