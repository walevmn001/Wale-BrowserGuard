# CHECKPOINT FIX-01 — Kết quả kiểm thử (sandbox, unit/integration)

> Cập nhật: 2026-11-27. Đây là kết quả trên **sandbox (Node + vitest)**, KHÔNG phải Chrome thật.
> Kết quả trên Chrome thật: **PENDING REAL-CHROME VERIFICATION** — xem `FIX-01_REAL_CHROME_CHECKLIST.md`.

## 1. Trước / sau

| Chỉ số | Trước FIX-01 (HEAD `add0a1e`) | Sau FIX-01 |
|--------|-------------------------------|------------|
| `npx vitest run` | 666 passed / 666 (62 file) | **708 passed / 708 (65 file)** |
| `npx tsc --noEmit` | pass | pass |
| `npm run lint` | 6 lỗi tồn tại sẵn | 6 lỗi tồn tại sẵn (không đổi) — xem mục 4 |
| `npm run build` | pass (main + youtube-main + youtube-isolated) | pass (main + youtube-main + youtube-isolated) |
| `npm run package` | pass, ZIP đủ bundle | pass, ZIP đủ bundle |

## 2. Test mới / cập nhật (Phase D)

| File | Vai trò | Ghi chú |
|------|---------|---------|
| `tests/unit/youtube/toggle-state.test.ts` | `resolveLayerDisplay` (toàn bộ nhánh handshake) + `isPendingState` | 22 test |
| `tests/unit/youtube/messages.test.ts` | thêm 2 DisplayState mới vào ma trận nhãn/thông điệp | 8 test |
| `tests/unit/youtube/runtime-status.test.ts` | mới: `buildRuntimeStatus`, `isYtRuntimeStatus`, `isStatusFresh`, `statusHostOf`, `HOOK_MODULE_BY_FLAG` | 13 test |
| `tests/unit/youtube/status-publisher.test.ts` | mới: serialize, dedupe, fail-open | 5 test |
| `tests/unit/youtube-status-store.test.ts` | mới (background): round-trip per-tab, giá trị hỏng, clear, fail-open | 6 test |
| `tests/unit/youtube/popup-yt-layers.test.ts` | viết lại theo signature 4-arg + trạng thái handshake | 18 test |
| `tests/unit/youtube/registry.test.ts`, `architecture.test.ts` | cập nhật theo fact `installed` | — |

Phạm vi phủ (Phase D yêu cầu):
- **Feature flags:** tắt/bật từng cờ, cả ba, ON→OFF và OFF→ON (qua `flags.subscribe` / per-call gate); snapshot thiếu/sai kiểu/đến muộn; MutationObserver cập nhật — phủ ở `flags`, `dataset-adapter`, `toggle-state`, `runtime-status`.
- **Registration:** MAIN+ISOLATED đăng ký thành công, một script lỗi, đăng ký lặp, unregister lặp, extension restart, reload tab, SPA — phủ ở `registration.test.ts` + `popup-yt-layers`.
- **Hook:** JSON hợp lệ/sai định dạng/quá cỡ, fetch/XHR thông thường, abort, network error, timeout, hook tắt giữa vòng đời — phủ ở `json-pruner`, `fetch-interceptor`, `xhr-interceptor`, `player-response-hook`.
- **Playback regression:** covered ở `playback-watchdog`, `playback-recovery`, `audio-state-manager` (fixture/mock, không dùng quảng cáo thật).

## 3. Bằng chứng build

- `npm run build` → 3 pass: web chính + `dist/youtube-main.js` (65.56 kB) + `dist/youtube-isolated.js` (12.11 kB), đều IIFE.
- `npm run package` → ZIP chứa: `manifest.json`, `service-worker.js`, `popup.js`, `options.js`, `warning.js`, `youtube-main.js`, `youtube-isolated.js`, assets + rulesets.

## 4. Lint — phân biệt lỗi cũ và lỗi mới

6 lỗi tồn tại **trước** checkpoint (không liên quan FIX-01, giữ nguyên theo yêu cầu):

1. `src/youtube/adapter/null-adapter.ts:19` `_snapshot` unused
2. `src/youtube/adapter/null-adapter.ts:24` `_callback` unused
3. `src/youtube/main/runtime-modules.ts:243` `video.currentTime` self-assign
4. `tests/unit/youtube/runtime-modules.test.ts:120` `_callback` unused
5. `tests/unit/youtube/runtime-modules.test.ts:123` `_options` unused
6. `tests/unit/youtube/xhr-interceptor.test.ts:132` `_raw` unused

Một lỗi **mới do FIX-01** đã phát hiện và **đã sửa**: `src/youtube/core/registry.ts` `no-useless-assignment` (biến `installed` khởi tạo `false` rồi luôn được gán lại) → đổi sang khai báo không khởi tạo.

## 5. Chrome thật

**PENDING REAL-CHROME VERIFICATION.** Không có hành vi playback hay khả năng chặn quảng cáo nào được VERIFIED trên Chrome thật trong checkpoint này.
