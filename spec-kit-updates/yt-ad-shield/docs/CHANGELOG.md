# Changelog

## [Chưa phát hành] — 2026-11-27 — engine Phase 6 (tích hợp popup/cấu hình) (IMPLEMENTED / TESTED)
- Module thay đổi: thêm `src/youtube/config/layers.ts`, `src/youtube/state/messages.ts`, `src/youtube/isolated/settings.ts`, `src/popup/yt-layers.ts`; sửa `src/youtube/state/toggle-state.ts` (chuyển `displayMessage` sang `state/messages.ts`), `src/popup/{elements,render,popup}.ts`, `src/popup/index.html`, `src/shared/i18n/{vi,en}.ts` (thêm 9 khóa). **Engine vẫn chưa kích hoạt** trong worker (seam `registration.ts` vẫn inert).
- Nguyên nhân: hoàn tất Phase 6 (tích hợp popup & cấu hình) của speckit `yt-ad-shield`.
- Tác động playback: popup chỉ đọc/ghi cấu hình; 3 cờ MAIN hiển thị `WAITING_FOR_ADAPTER` (dùng `NullAdapter`, chưa truyền được) và không bao giờ báo "đã tắt/thành công". Cờ ISOLATED áp dụng sau khi tải lại trang. Không thay đổi hành vi chặn hiện tại.
- Registry: `SELECTORS_VERSION` chưa đặt (selectors vẫn UNVERIFIED), `ENDPOINTS_VERSION` chưa đặt, `RULES_VERSION` chưa đặt.
- Kiểm thử: unit **652 pass / 652** (61 file, gồm 25 file `tests/unit/youtube/*`); `tsc --noEmit` pass; `npm run build` pass, sinh `dist/youtube-main.js` (48.80 kB, IIFE).
- Git tag: chưa tạo.

## [Chưa phát hành] — 2026-11-27 — engine Phase 4–5 (IMPLEMENTED / TESTED)
- Module thay đổi: thêm `core/timers.ts`, `core/playback-watchdog.ts`, `core/playback-recovery.ts`, `core/dom-observer.ts`, `core/spa-navigation.ts`, `core/css-hider.ts`, `core/dnr-manager.ts`, `main/runtime-modules.ts`; sửa `main/main.ts` (đăng ký 4 module runtime), `config/tuning.ts` (`TUNING_VERSION` 2→3, thêm `recoveryL1Ms`, `dnrMaxRules`), `testing/harness.ts` (thêm `FakeTimers`). **Engine vẫn chưa kích hoạt** trong worker.
- Nguyên nhân: hoàn tất Phase 4 (bảo vệ playback) và Phase 5 (vòng đời & tích hợp) của speckit `yt-ad-shield`.
- Tác động playback: mọi thành phần fail-open; watchdog **chỉ đọc**, không tự seek/reload; recovery chọn cấp tối thiểu (waits → resync → nudge một lần có cooldown); nghi ngờ lỗi engine thì không chạm media. Vì engine chưa được nạp nên **không** thay đổi hành vi hiện tại.
- Registry: `SELECTORS_VERSION` chưa đặt (selectors vẫn UNVERIFIED), `ENDPOINTS_VERSION` chưa đặt, `RULES_VERSION` chưa đặt.
- Kiểm thử: unit **620 pass / 620** (57 file, gồm 21 file `tests/unit/youtube/*`); `tsc --noEmit` pass; `npm run build` pass, sinh `dist/youtube-main.js` (48.80 kB, IIFE).
- Git tag: chưa tạo.

## [Chưa phát hành] — 2026-11-27 — engine Phase 1–3 (IMPLEMENTED / TESTED)
- Module thay đổi: engine YouTube mới ở `adblock-spec-kit/src/youtube/**` (config, registry, core, adapter, state, main, isolated, testing). **Chưa kích hoạt** trong worker.
- Nguyên nhân: bắt đầu tái triển khai module YouTube theo speckit `yt-ad-shield` (Phase 0–3).
- Tác động playback: engine mới **fail-open**, chưa được nạp → **không** thay đổi hành vi hiện tại của extension; module YouTube cũ vẫn là đường chạy.
- Registry: `SELECTORS_VERSION` chưa đặt (mọi selector UNVERIFIED), `ENDPOINTS_VERSION` chưa đặt, `RULES_VERSION` chưa đặt.
- Kiểm thử: unit 563 pass / 563 (50 file, gồm 14 file `tests/unit/youtube/*`); `tsc --noEmit` pass; `npm run build` pass, sinh `dist/youtube-main.js` (25.08 kB).
- Git tag: chưa tạo.

## [Chưa phát hành] — 2026-11-26
- Trạng thái: đặc tả v3, chưa có code.
- Module thay đổi: không có (chỉ tài liệu và đặc tả).
- Nguyên nhân: bổ sung yêu cầu bảo trì và cập nhật lâu dài.
- Tác động playback: chưa có (chưa có code).
- Kiểm thử: không áp dụng.

## [Chưa phát hành] — đặc tả v4
- Module thay đổi: không có code. Thêm contract `feature-flags.md` và `adapter.md`.
- Nguyên nhân: T004 OPEN, cần cô lập để không chặn registry.
- Tác động playback: chưa có.
- Kiểm thử: không áp dụng.

## Mẫu mục mới
```
## [X.Y.Z] — YYYY-MM-DD
- Module thay đổi: ...
- Nguyên nhân: ... (kèm bằng chứng nếu sửa selector hoặc endpoint)
- Tác động playback: ...
- Registry: SELECTORS_VERSION, ENDPOINTS_VERSION, RULES_VERSION
- Kiểm thử: unit / integration / regression / playback, kết quả
- Git tag: vX.Y.Z (checkpoint trước: <hash>, sau: <hash>)
```

## Quy trình rollback
1. Xác định tag ổn định gần nhất.
2. `git checkout vX.Y.Z` (hoặc tạo nhánh từ tag).
3. Kiểm tra migration cấu hình: phiên bản cũ phải bỏ qua khóa không nhận ra (FR-042).
4. Chạy checklist playback trước khi phát hành lại.
