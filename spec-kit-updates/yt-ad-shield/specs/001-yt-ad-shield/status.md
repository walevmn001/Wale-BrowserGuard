# Trạng thái và báo cáo cập nhật Speckit: YT Ad Shield

**Phiên bản đặc tả:** v2
**Trạng thái định nghĩa:** SPECIFIED, IMPLEMENTED, TESTED, VERIFIED

## 1. Bằng chứng hiện có

> **Cập nhật 2026-11-27:** Engine Phase 1–3 đã có bằng chứng IMPLEMENTED và TESTED (unit) trong extension WALE GUARD. Xem **mục 13** ở cuối tài liệu. Các mục 2–12 dưới đây giữ nguyên trạng thái lịch sử (SPECIFIED) và được thay thế một phần bởi mục 13. **Không có hạng mục nào VERIFIED trên YouTube/Chrome thật.**

## 2. Sáu thuật toán ban đầu (giữ nguyên, không xóa)

| # | Thuật toán | FR liên quan | Trạng thái | Ghi chú |
|---|-----------|--------------|------------|---------|
| 1 | Lọc JSON (prune) | FR-004, FR-005 | SPECIFIED | Đã có. Bổ sung bảo vệ khóa playback ở FR-020 |
| 2 | Hook ytInitialPlayerResponse | FR-002 | SPECIFIED | Đã có. Bổ sung chống cài trùng ở FR-019 |
| 3 | Hook fetch | FR-003, FR-006 | SPECIFIED | Đã có. Viết lại theo FR-021 |
| 4 | Chặn request (DNR) | FR-008 | SPECIFIED | Đã có. Bổ sung nhóm, rollback, chống chặn nhầm ở FR-032 |
| 5 | Runtime guard | FR-009 đến FR-012 | SPECIFIED | Đã có. Tách thành nhiều module ở v2 |
| 6 | CSS hider | FR-013 | SPECIFIED | Đã có, không thay đổi |

## 3. Hạng mục v2 (18 hạng mục từ đặc tả bổ sung)

| Mục | Hạng mục | Trạng thái nội dung trước v2 | Hành động v2 | FR mới | Trạng thái |
|-----|----------|------------------------------|--------------|--------|-----------|
| 7 | Hook XHR | Không có | Thêm mới | FR-018 | SPECIFIED |
| 8 | Hook Main World sớm | Một phần (FR-001, FR-002) | Bổ sung chống trùng, giao tiếp có kiểm tra | FR-019 | SPECIFIED |
| 9 | Phân loại response | Không có | Thêm mới, có danh sách khóa bảo vệ | FR-020 | SPECIFIED |
| 10 | Bảo toàn Response API | Một phần (FR-006) | Mở rộng loại trừ status và type | FR-021 | SPECIFIED |
| 11 | Ad State Machine | Không có | Thêm mới, có bảng chuyển đổi | FR-022 | SPECIFIED |
| 12 | Phát hiện đa tín hiệu | Một phần (class ad-showing) | Mở rộng, thêm phân loại buffering | FR-023 | SPECIFIED |
| 13 | Quyền sở hữu âm thanh | Một phần (FR-012) | Mở rộng snapshot và cờ ourChange | FR-024 | SPECIFIED |
| 14 | Skip an toàn | Một phần (FR-011) | Mở rộng điều kiện, cooldown, seek một lần | FR-025 | SPECIFIED |
| 15 | Playback Watchdog | Không có | Thêm mới | FR-026 | SPECIFIED |
| 16 | Playback Recovery | Không có | Thêm mới, bốn cấp | FR-027 | SPECIFIED |
| 17 | SPA Navigation | Một phần (mục biên) | Thêm sự kiện và quy trình reset | FR-028 | SPECIFIED |
| 18 | MutationObserver | Không có | Thêm mới, có debounce và disconnect | FR-029 | SPECIFIED |
| 19 | Lifecycle Manager | Không có | Thêm mới | FR-030 | SPECIFIED |
| 20 | Fail-open toàn hệ thống | Một phần (FR-005, constitution III) | Thêm error boundary và ngưỡng vô hiệu hóa | FR-031 | SPECIFIED |
| 21 | DNR an toàn | Một phần (FR-008) | Mở rộng nhóm, rollback, test chặn nhầm | FR-032 | SPECIFIED |
| 22 | Debug Logger | Một phần (FR-017, cờ DEBUG) | Mở rộng nội dung, ring buffer | FR-033 | SPECIFIED |
| 23 | Regression tests | Không có | Thêm 18 ca R01 đến R18 | FR-034 | SPECIFIED |
| 24 | Kiểm thử bảo toàn playback | Không có | Thêm A/B checklist | FR-035 | SPECIFIED |
| + | Chẩn đoán màn hình đen | Không có | Thêm bảng tín hiệu và nguyên nhân | FR-036 | SPECIFIED |
| + | Kiến trúc và quyền module | Một phần (plan.md mục 2) | Thêm bảng 17 module và quy tắc | FR-037 | SPECIFIED |
| + | Nguyên tắc bảo toàn playback | Không có | Thêm | FR-038 | SPECIFIED |

## 4. Nội dung đã tồn tại và được giữ lại

- Toàn bộ FR-001 đến FR-017, US-1 đến US-5, mục 6 đến 10 của `spec.md` v1.
- Toàn bộ cấu trúc thư mục và thiết kế manifest trong `plan.md` mục 1 đến 10.
- Toàn bộ `constitution.md` mục I đến VII.
- Các tác vụ T001 đến T022 trong `tasks.md`.

## 5. Nội dung đã điều chỉnh

| Vị trí | Trước | Sau | Lý do |
|--------|-------|-----|-------|
| FR-010 | Tua tới cuối khi `duration` hợp lệ | Tua tối đa một lần mỗi quảng cáo, khi đã xác nhận và an toàn | Mục 14: không seek liên tục, không seek khi không có quảng cáo |
| US-3 | Tua tới cuối trong 2 giây | Tua tối đa một lần, có điều kiện | Tương tự FR-010 |
| Trạng thái spec | Bản nháp | Bản nháp v2 | Cập nhật phiên bản |
| Constitution | I đến VII | Thêm VIII (bảo toàn playback), IX (trạng thái có bằng chứng), X (quyền module) | Yêu cầu mục 1 và 5 |
| plan.md mục 4 | Chưa quyết định cờ MAIN/isolated | Giữ nguyên là câu hỏi mở | Chưa có bằng chứng để chọn |

## 6. Nội dung mâu thuẫn hoặc cần lưu ý

- FR-011 v1 chỉ kiểm tra `offsetParent`. FR-025 v2 bổ sung nhiều điều kiện hơn. Đây là mở rộng, không mâu thuẫn.
- Quyết định cờ MAIN/isolated (T004) vẫn chưa chốt và ảnh hưởng đến FR-019.
- Plan v1 mục 7.1 cho phép tắt tiếng khi quảng cáo mà không theo dõi snapshot. FR-024 v2 thay thế bằng snapshot. Đây là điều chỉnh có chủ đích.

## 7. Các vấn đề chưa thể xác minh

- Tên khóa quảng cáo, đường dẫn trong JSON, endpoint thực sự là quảng cáo.
- Sự kiện `yt-navigate-finish` và `yt-page-data-updated`.
- Selector ad module, nút skip, và thuộc tính player liên quan quảng cáo.
- Ngưỡng số: mọi giá trị trong spec v2 là đề xuất, chưa đo.
- Giới hạn số rule DNR trên Chrome mục tiêu.
- Hành vi `world: "MAIN"` và thứ tự chạy với YouTube trên phiên bản Chrome thực tế.
- Hành vi chặn request video khi rule mới được áp dụng (FR-032).

## 8. Giới hạn kỹ thuật của Chrome MV3 cần ghi nhớ

- MAIN world không đọc được `chrome.storage`, phải đi qua `dataset` hoặc `postMessage`.
- Không có service worker chạy liên tục trong thiết kế này, trạng thái mất khi đóng tab.
- DNR chặn theo mẫu URL, không đọc được nội dung response. Chặn theo nội dung phải dùng hook JS.
- Không có `webRequest` blocking trong bản này.

## 9. Bước tiếp theo đề xuất

1. Chốt T004 (cờ MAIN/isolated).
2. Kiểm tra các điểm mục 11.5 trong `plan.md` trên YouTube thật, ghi kết quả vào mục 7 ở trên.
3. Triển khai theo giai đoạn 8 của `tasks.md` (T023 đến T041), cập nhật trạng thái sau từng bước có bằng chứng.

---

## 10. Cập nhật v3: bảo trì và cập nhật lâu dài

**Trạng thái định nghĩa:** SPECIFIED. Không có hạng mục nào IMPLEMENTED, TESTED hay VERIFIED.

| Mục | Hạng mục | FR | Trạng thái | Ghi chú |
|-----|----------|----|-----------|---------|
| 1 | Modular architecture | FR-039 | SPECIFIED | Interface module ở plan mục 12.3 |
| 2 | Cấu hình tập trung | FR-040 | SPECIFIED | Ba nhóm: bảo mật, hiệu năng, hành vi |
| 3 | Selector, endpoint, rule registry | FR-041 | SPECIFIED | `selectors.js`, `endpoints.js`, `rules.js` |
| 4 | Versioning và compatibility | FR-042 | SPECIFIED | Version extension, schema, registry; migration |
| 5 | Feature flags | FR-043 | SPECIFIED | Cờ theo module, ba nguồn ưu tiên |
| 6 | Compatibility và fallback | FR-046 | SPECIFIED | Kiểm tra API và DOM trước khi cài |
| 7 | Regression và compatibility test | FR-044 | SPECIFIED | Thứ tự 8 bước, baseline |
| 8 | Update và rollback | FR-045 | SPECIFIED | Changelog, Git checkpoint, tag |
| 9 | Documentation | FR-047 | SPECIFIED | Tám file trong `docs/` đã có khung |
| 10 | Maintenance principle | mục 12.5 | SPECIFIED | Quy trình 7 bước |

**Điều chỉnh so với yêu cầu gốc:**

- `rules.js` là nguồn, `rules/ads.json` là bản sinh (xem spec mục 12.9). Lý do: Chrome đọc DNR rule từ JSON tĩnh.
- Registry dùng script cổ điển, không dùng ES module, vì content script nạp theo thứ tự trong manifest.

**Không mở rộng phạm vi chặn:** mọi endpoint và selector trong `docs/` đều ghi `UNVERIFIED`, không có mục nào được dùng để mở rộng DNR.

**Mâu thuẫn còn lại:**

- Câu hỏi mở T004 (cờ MAIN/isolated) vẫn chưa chốt. Với cấu trúc v3, registry nạp vào cả hai world, nên T004 chỉ còn ảnh hưởng đến cách truyền cờ bật/tắt, không ảnh hưởng đến registry.

**Thiếu sót đã biết:**

- `docs/` chỉ có khung và bảng trống. Chưa có nội dung đã xác minh.
- Chưa có lint, build script, hay test nào được viết. Các tác vụ T046, T047, T051 là kế hoạch.


---

## 11. Cập nhật v4: T004 OPEN, không chặn

**Trạng thái định nghĩa:** SPECIFIED. Không có hạng mục nào IMPLEMENTED, TESTED hay VERIFIED.

| Hạng mục | Trạng thái | Phụ thuộc T004 | Ghi chú |
|----------|-----------|----------------|---------|
| FeatureFlags (world-independent) | SPECIFIED | Không | `contracts/feature-flags.md` |
| Adapter boundary | SPECIFIED | Một phần | Contract không phụ thuộc, triển khai thì có |
| NullAdapter | SPECIFIED | Không | Adapter hợp lệ khi chưa chốt cơ chế |
| Contract test chung cho adapter | SPECIFIED | Không | Bảy mục, chạy được với adapter giả |
| Registry và config | SPECIFIED | Không | Không đổi từ v3 |
| Adapter cụ thể (dataset, postMessage hoặc CustomEvent) | Chưa chọn | Có | Chỉ làm sau T004 |
| Đo thứ tự chạy giữa hai world | Chưa thực hiện | Có | A-4 |

**Giả định:**

- A-1 đến A-5 trong `contracts/adapter.md` mục 8.
- Khi chưa có snapshot, ba cờ MAIN dùng mặc định từ `features.js` (A-3). Popup không tắt được các hook này trước khi T004 chốt. Đây là hạn chế đã biết.

**Điều chỉnh so với v3:**

- T016 được tách thành T016a (không phụ thuộc) và T016b (bị chặn bởi T004).
- T023 không còn bao gồm phần giao tiếp `postMessage`, phần này chuyển vào adapter.
- T004 vẫn OPEN nhưng không còn là điều kiện cho bất kỳ tác vụ nào ngoài T061 đến T065.

**Bước tiếp theo không bị chặn:** T056 đến T060.


---

## 12. Cập nhật v5: giả định chưa xác minh và trạng thái popup

**Trạng thái định nghĩa:** SPECIFIED. Không có hạng mục nào IMPLEMENTED, TESTED hay VERIFIED.

| Hạng mục | Trạng thái | Phụ thuộc T004 | Ghi chú |
|----------|-----------|----------------|---------|
| A-2: MAIN không đọc được chrome.storage | UNVERIFIED | Không | Thủ tục ở `verification/A-2-main-storage-access.md`, chưa chạy |
| A-3: mặc định bật khi chưa có snapshot | SPECIFIED | Không | Ghi trong README, popup và `adapter.md` mục 10 |
| A-4: thứ tự chạy document_start | UNVERIFIED | Không | Thủ tục ở `verification/A-4-document-start-order.md`, chưa chạy |
| Mô hình trạng thái (desired, effective, adapter, snapshot) | SPECIFIED | Không | `contracts/popup-state.md` mục 2 |
| Trạng thái hiển thị và bảng suy ra | SPECIFIED | Không | `popup-state.md` mục 3 |
| WAITING_FOR_ADAPTER | SPECIFIED | Không | Nội dung và cấm cụm từ ở mục 4, 5.1 |
| RECONCILING | SPECIFIED | Có | Chỉ làm sau T004 |
| README hành vi chờ adapter | SPECIFIED | Không | Bản nháp đã có ở `README.md` |

**Đồng bộ tài liệu:** bốn mệnh đề trong `adapter.md` mục 11 đã được viết giống nhau ở `README.md`, `adapter.md` và `popup-state.md`.

**Điều chỉnh:**

- A-2 và A-4 được chuyển từ giả định thành UNVERIFIED có thủ tục kiểm thử cụ thể.
- Popup có thêm `RECONCILING` ngoài danh sách yêu cầu (`WAITING_FOR_ADAPTER`, `ENABLED`, `DISABLED`, `ERROR`, `UNKNOWN`). Lý do: cần trạng thái trung gian để không báo thành công trước khi MAIN xác nhận.

**Không mở rộng phạm vi:** tài liệu không chọn cơ chế truyền. T004 vẫn OPEN.


---

## 13. Cập nhật v6: engine Phase 1–3 IMPLEMENTED / TESTED (2026-11-27)

**Trạng thái định nghĩa:** SPECIFIED cho Phase 4–7; **IMPLEMENTED / TESTED (unit)** cho Phase 1–3; **chưa VERIFIED** trên Chrome/YouTube thật.

**Vị trí code:** `adblock-spec-kit/src/youtube/**` (TypeScript, tích hợp vào build Vite hiện có theo quyết định đã chốt).

### Hạng mục có bằng chứng

| Trách nhiệm (17) | File | Interface | Trạng thái | Test |
|------------------|------|-----------|------------|------|
| 1 JSON Pruner | `core/json-pruner.ts` | `pruneJson(value, adKeys, limits)` | IMPLEMENTED / TESTED | `json-pruner.test.ts` |
| 2 Player Response Hook | `main/player-response-hook.ts` | `installPlayerResponseHook(target, opts)` | IMPLEMENTED / TESTED | `player-response-hook.test.ts` |
| 3 Fetch Interceptor | `main/fetch-interceptor.ts` | `createFetchInterceptor(deps).wrap(orig)` | IMPLEMENTED / TESTED | `fetch-interceptor.test.ts` |
| 4 XHR Interceptor | `main/xhr-interceptor.ts` | `createXhrInterceptor(deps).wrap(Ctor)` | IMPLEMENTED / TESTED | `xhr-interceptor.test.ts` |
| 6 Ad Detector | `core/ad-detector.ts` | `classifyAd`, `classifyPlayback` | IMPLEMENTED / TESTED | `ad-detector.test.ts` |
| 7 Ad State Machine | `core/ad-state-machine.ts` | `reduce(state, event, now, max?)` | IMPLEMENTED / TESTED | `ad-state-machine.test.ts` |
| 8 Ad Action Controller | `core/ad-action-controller.ts` | `performAdAction(target, opts)` | IMPLEMENTED / TESTED | `ad-action-controller.test.ts` |
| 9 Audio State Manager | `core/audio-state-manager.ts` | `AudioStateManager` | IMPLEMENTED / TESTED | `audio-state-manager.test.ts` |
| 14 Lifecycle Manager | `core/lifecycle-manager.ts` | `add(fn)`, `disposeAll()` | IMPLEMENTED / TESTED | `registry.test.ts` |
| 16 Debug Logger | `core/debug-logger.ts` | `DebugLogger` | IMPLEMENTED / TESTED | `registry.test.ts` |
| Feature Flags (world-independent) | `config/flags.ts` | `FeatureFlags` (12 cờ, all-or-nothing) | IMPLEMENTED / TESTED | `flags.test.ts` |
| Adapter boundary | `adapter/adapter.ts`, `adapter/null-adapter.ts` | `FlagAdapter`, `NullAdapter` | IMPLEMENTED / TESTED | `adapter-null.test.ts` |
| Selector registry | `registry/selectors.ts` | `SelectorRegistry`, `skipButtonSelectors()` | IMPLEMENTED (UNVERIFIED) | `architecture.test.ts` |
| Endpoint registry | `registry/endpoints.ts` | `isProtected`, `PROTECTED_PLAYER_PATH` | IMPLEMENTED (UNVERIFIED) | `architecture.test.ts` |
| DNR rule builder | `registry/rules.ts` | `buildDnrRules(...)` | IMPLEMENTED (UNVERIFIED) | `architecture.test.ts` |
| Popup state | `state/toggle-state.ts` | `resolveDisplay`, `displayMessage` | IMPLEMENTED / TESTED | `toggle-state.test.ts` |
| Module registry | `core/registry.ts` | `ModuleRegistry` | IMPLEMENTED / TESTED | `registry.test.ts` |
| MAIN boot | `main/main.ts`, `main/content-entry.ts` | `bootYouTubeEngine(win)` | IMPLEMENTED / TESTED | (gián tiếp) |
| Registration seam (ISOLATED) | `isolated/registration.ts` | `syncEngineRegistration(api, enabled)` | IMPLEMENTED / TESTED (chưa gọi) | `registration.test.ts` |
| Tuning | `config/tuning.ts` | `TUNING`, `TUNING_VERSION` | IMPLEMENTED (UNVERIFIED) | `architecture.test.ts` |

### Chưa triển khai (Phase 4–7)

| # | Trách nhiệm | Trạng thái |
|---|-------------|------------|
| 5 | DNR Manager (áp dụng/rollback rule động) | SPECIFIED |
| 10 | Playback Watchdog | SPECIFIED |
| 11 | Playback Recovery | SPECIFIED |
| 12 | DOM Observer | SPECIFIED |
| 13 | SPA Navigation Manager | SPECIFIED |
| 15 | CSS Hider | SPECIFIED |
| — | Tích hợp worker (gọi `syncEngineRegistration`) | SPECIFIED (Phase 5–6) |
| — | Popup 3 cờ MAIN + `WAITING_FOR_ADAPTER` | SPECIFIED (Phase 6) |

### Bằng chứng kiểm thử

- `npx vitest run` → **563 passed / 50 file** (14 file `tests/unit/youtube/*` thuộc engine mới).
- `npx tsc --noEmit` → pass.
- `npm run build` → pass, sinh `dist/youtube-main.js` (25.08 kB, IIFE).
- **Chưa có** bằng chứng trên Chrome/YouTube thật → mọi mục playback là UNVERIFIED.

### Ràng buộc đã giữ

- Engine **chưa được kích hoạt** (seam inert) → không đổi hành vi hiện tại.
- Module YouTube cũ **không bị xóa/sửa**.
- T004 vẫn **OPEN**. A-2, A-4 vẫn **UNVERIFIED**. Không chọn cơ chế truyền cờ.
- Logic dùng chung không chạm `window`/`document`/`chrome` (kiểm bằng `architecture.test.ts`).

### Rủi ro còn tồn tại

- Selector, endpoint, khóa JSON quảng cáo đều UNVERIFIED → nguy cơ false positive/negative chưa đo.
- Ngưỡng `TUNING` là đề xuất, chưa hiệu chỉnh.
- Chưa có bằng chứng engine mới ở world MAIN không gây màn hình đen (đây chính là mục tiêu Phase 4 + 7).
- Việc kích hoạt engine (Phase 5–6) là thay đổi có rủi ro playback → phải sau khi có bằng chứng Chrome thật.

---

## 14. Cập nhật v7: engine Phase 4–5 IMPLEMENTED / TESTED (2026-11-27)

**Trạng thái định nghĩa:** SPECIFIED cho Phase 6–7; **IMPLEMENTED / TESTED (unit)** cho Phase 1–5; **chưa VERIFIED** trên Chrome/YouTube thật.

**Vị trí code:** `adblock-spec-kit/src/youtube/**`.

### Hạng mục Phase 4–5 có bằng chứng

| # | Trách nhiệm | File | Interface | Test |
|---|-------------|------|-----------|------|
| 5 | DNR Manager | `core/dnr-manager.ts` | `buildDnrPlan(groups, isProtected, max?)`, `applyDnrPlan(api, next, prev?)` | `dnr-manager.test.ts` |
| 10 | Playback Watchdog | `core/playback-watchdog.ts` | `PlaybackWatchdog.attach/sample/stalledForMs` | `playback-watchdog.test.ts` |
| 11 | Playback Recovery | `core/playback-recovery.ts` | `PlaybackRecovery.diagnose(input, now)` | `playback-recovery.test.ts` |
| 12 | DOM Observer | `core/dom-observer.ts` | `DomObserver.observe/isObserving/disconnect` | `dom-observer.test.ts` |
| 13 | SPA Navigation | `core/spa-navigation.ts` | `SpaNavigationManager.notify/flush/lastTargets` | `spa-navigation.test.ts` |
| 15 | CSS Hider | `core/css-hider.ts` | `buildHideCss(selectors)`, `hideSelectors(reg)` | `css-hider.test.ts` |
| — | Timer seam | `core/timers.ts` | `TimerApi`, `realTimers` | (dùng trong test debounce) |
| — | Runtime wiring | `main/runtime-modules.ts` + đăng ký trong `main/main.ts` | `createWatchdogModule/ObserverModule/SpaModule/CssModule` | `runtime-modules.test.ts` |

Các mục 5, 10–13, 15 nay **IMPLEMENTED / TESTED (unit)**; 17/17 trách nhiệm logic đã có code + test.

### Bằng chứng kiểm thử

- `npx vitest run` → **620 passed / 57 file** (21 file `tests/unit/youtube/*` thuộc engine mới).
- `npx tsc --noEmit` → pass.
- `npm run build` → pass, sinh `dist/youtube-main.js` (48.80 kB, IIFE).
- **Chưa có** bằng chứng trên Chrome/YouTube thật → mọi mục playback vẫn UNVERIFIED.

### Quyết định thiết kế Phase 4–5

- `TUNING_VERSION` 2→3: thêm `recoveryL1Ms` (grace cấp 1) và `dnrMaxRules` (trần rule DNR).
- Watchdog: `WeakSet` chống listener trùng; stall/error latch chỉ báo một lần; `readyState` tăng được coi là tiến triển.
- Recovery 4 cấp: WAIT → RESYNC → NUDGE (một lần, `currentTime = currentTime`, cooldown) → DISABLED; không bao giờ seek mù hay reload; nhánh SUSPECT_EXTENSION không chạm media.
- DNR Manager: plan bị từ chối toàn bộ khi trùng id hoặc vượt trần; apply thất bại → rollback về rule cũ.
- Debounce dùng `TimerApi` (`core/timers.ts`) → test bằng `FakeTimers` (harness), world-independent.

### Chưa triển khai (Phase 6–7)

| Trách nhiệm | Trạng thái |
|-------------|------------|
| Tích hợp worker (gọi `syncEngineRegistration`) | SPECIFIED (Phase 5–6) |
| Popup 3 cờ MAIN + `WAITING_FOR_ADAPTER` | SPECIFIED (Phase 6) |
| Kiểm thử Chrome thật + regression ngoài YouTube | SPECIFIED (Phase 7) |

### Ràng buộc đã giữ (không đổi so với v6)

- Engine **chưa được kích hoạt** (seam inert) → không đổi hành vi hiện tại.
- Module YouTube cũ **không bị xóa/sửa**.
- T004 vẫn **OPEN**. A-2, A-4 vẫn **UNVERIFIED**.
- Logic dùng chung (`core/`, `config/`, `registry/`, `adapter/`, `state/`) không chạm `window`/`document`/`chrome` — kiểm bằng `architecture.test.ts` (đã sửa 2 comment của `dom-observer`/`dnr-manager` để không chứa token bị quét).

### Git

- Commit Phase 4–5: `60d9bc4` (23 file, +2514/−23); push `origin main` **thành công** (`f7b3c3a..60d9bc4`).

---

## 15. Cập nhật v8: engine Phase 6 IMPLEMENTED / TESTED (2026-11-27)

**Trạng thái định nghĩa:** SPECIFIED cho Phase 7; **IMPLEMENTED / TESTED (unit)** cho Phase 1–6; **chưa VERIFIED** trên Chrome/YouTube thật.

**Vị trí code:** `adblock-spec-kit/src/youtube/**` và `adblock-spec-kit/src/popup/**`.

### Hạng mục Phase 6 có bằng chứng

| Trách nhiệm | File | Interface | Test |
|-------------|------|-----------|------|
| Nhóm layer hiển thị | `config/layers.ts` | `MAIN_LAYERS`, `ISOLATED_LAYERS`, `ENGINE_LAYERS`, `isMainFlag(flag)` | `layers.test.ts` |
| Thông điệp popup | `state/messages.ts` | `DISPLAY_LABELS`, `displayMessage(state, reason?)`, `FORBIDDEN_MAIN_PHRASES`, `hasForbiddenMainPhrase(text)`, `WAITING_SAVED_NOTE`, `RELOAD_NOTE` | `messages.test.ts` |
| Lưu cấu hình layer | `isolated/settings.ts` | `YouTubeEngineSettings` (`desired`/`desiredFlags`/`setFlag`), khóa `youtubeEngineFlags` | `engine-settings.test.ts` |
| Dựng row cho popup | `popup/yt-layers.ts` | `buildYtLayers(desired, adapter, snapshot)`, `mainGroupState(rows)` | `popup-yt-layers.test.ts` |
| Nối popup | `popup/{popup,render,elements}.ts`, `popup/index.html`, `shared/i18n/{vi,en}.ts` | `renderYtEngine`, `buildYtLayers` | (gián tiếp qua popup-yt-layers) |

### Quyết định thiết kế Phase 6

- `displayMessage` **dời** từ `state/toggle-state.ts` sang `state/messages.ts` để `toggle-state.ts` thuần logic; `resolveDisplay` và các type giữ nguyên. `architecture.test.ts` vẫn xanh (cả hai file đều pure).
- Popup chỉ dùng **NullAdapter** cho 3 cờ MAIN → luôn `WAITING_FOR_ADAPTER` với `snapshot = MISSING`; đúng nghiệm thu §7 ("desired = OFF mà adapter = WAITING → KHÔNG hiển thị 'Đã tắt'").
- `buildYtLayers` đặt `effective = desired` cho cờ MAIN để bảng ưu tiên (`resolveDisplay`) quyết định; nhờ vậy khi adapter chuyển `READY` + snapshot `AVAILABLE` thì cờ MAIN mới hiển thị `ENABLED`/`DISABLED`.
- Cờ ISOLATED (DNR/RUNTIME_GUARD/CSS_HIDER) phản ánh thẳng lựa chọn đã lưu; không đi qua adapter.
- i18n: thêm 9 khóa (`ppYtEngine`, `ppYtReloadNote`, `ppYtSavedShort`, 6 nhãn layer); EN là `Record<keyof typeof VI, string>` nên lệch khóa sẽ fail build.

### Bằng chứng kiểm thử

- `npx vitest run` → **652 passed / 61 file** (25 file `tests/unit/youtube/*` thuộc engine mới).
- `npx tsc --noEmit` → pass.
- `npm run build` → pass, sinh `dist/youtube-main.js` (48.80 kB, IIFE).
- **Chưa có** bằng chứng trên Chrome/YouTube thật → mọi mục playback vẫn UNVERIFIED.

### Chưa triển khai (Phase 7)

| Trách nhiệm | Trạng thái |
|-------------|------------|
| Kiểm thử Chrome thật + regression ngoài YouTube | SPECIFIED (Phase 7) |
| Task phụ thuộc T004 (T016b, T061–T065, T073–T074) | BLOCKED |

### Ràng buộc đã giữ (không đổi so với v7)

- Engine **chưa được kích hoạt** (seam `registration.ts` inert) → không đổi hành vi hiện tại.
- Module YouTube cũ **không bị xóa/sửa**.
- T004 vẫn **OPEN**. A-2, A-4 vẫn **UNVERIFIED**.
- Logic dùng chung (`core/`, `config/`, `registry/`, `adapter/`, `state/`) không chạm `window`/`document`/`chrome` — kiểm bằng `architecture.test.ts`.

### Git

- Commit Phase 6: `2c60594` (22 file, +916/−74); push `origin main` **thành công** (`f7ced95..2c60594`).

---

## 16. Cập nhật v9: checkpoint Phase 7 — PENDING_REAL_CHROME_VALIDATION (2026-11-27)

**Trạng thái định nghĩa:** SPECIFIED cho Phase 7 (chưa chạy); **IMPLEMENTED / TESTED (unit)** cho Phase 0–6; **chưa VERIFIED** trên Chrome/YouTube thật.

**Đây là checkpoint bàn giao implementation/validation-preparation — KHÔNG phải bản stable/production-ready.**

### Trạng thái Phase 7

| Hạng mục | Trạng thái |
|----------|-----------|
| Kế hoạch kiểm thử Chrome thật (`PHASE_7_REAL_CHROME_TEST_PLAN.md`, 24 ca) | ĐÃ BÀN GIAO |
| Mẫu ghi kết quả (`PHASE_7_TEST_RESULTS.md`) | ĐÃ BÀN GIAO (mọi ô = `NOT_RUN`) |
| Chạy thực tế trên Chrome/YouTube thật | **CHƯA CHẠY** — chờ người dùng tự chạy |
| Kết quả PASS/FAIL | **KHÔNG CÓ** |
| Xác nhận khả năng chặn quảng cáo thật | **CHƯA XÁC NHẬN** |

### Bất biến kỹ thuật đã giữ (đối chiếu lại khi đóng gói checkpoint)

- Engine **INERT**; seam `isolated/registration.ts` **chưa được gọi** (không có caller trong `src/`).
- `manifest.json` (build) **không** có `content_scripts`; `service-worker.js` **không** chứa `registerContentScripts`/`youtube-main`.
- Ba cờ MAIN (`ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK`, `ENABLE_XHR_HOOK`) vẫn `WAITING_FOR_ADAPTER`.
- **T004 = OPEN.** A-2, A-4 = **UNVERIFIED**. T016b, T061–T065, T073–T074 = **BLOCKED**.
- Hash khớp kế hoạch: `dist/manifest.json` = `c13a64de…7426`, `dist/youtube-main.js` = `154b4612…3a97`.

### Git

- Checkpoint commit: `chore(release): checkpoint YouTube validation pending` (push `origin main`; hash xem `git log` và release notes).
- Tag/Release: `phase-P7-pending` (prerelease — checkpoint, **không** kèm binary).
- Không xóa tag/release/artifact cũ.
