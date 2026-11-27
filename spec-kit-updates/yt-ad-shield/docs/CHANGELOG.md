# Changelog

## [Chưa phát hành] — 2026-11-27 — engine TÍCH HỢP / KÍCH HOẠT + T004 chốt (IMPLEMENTED / TESTED, chưa VERIFIED)
- Loại: **tích hợp** engine tái triển khai vào extension WALE GUARD — engine **không còn INERT**.
- Module thay đổi: thêm `src/youtube/adapter/dataset-adapter.ts`, `src/youtube/isolated/content-entry.ts`, `src/youtube/main/ad-control-module.ts`; sửa `src/youtube/isolated/registration.ts` (đăng ký **cả** MAIN+ISOLATED, `isEngineRegistered`, `bridgeRegistration`), `src/youtube/main/main.ts` (boot `DatasetAdapter` + module ad-control), `src/youtube/main/runtime-modules.ts`, `src/youtube/config/tuning.ts` (`TUNING_VERSION` 3→4), `src/background/service-worker.ts` (retire module v1; `applyYouTubeEngineRegistration()`), `src/popup/popup.ts` (phản ánh trạng thái thật), `vite.config.ts` + `vite.youtube-isolated.config.ts` + `scripts/package-release.ts` + `package.json` (3 pass build + release plugin ở pass cuối).
- **T004 = CLOSED** — chọn phương án A: thuộc tính JSON `data-wg-yt-flags` trên `<html>`; ISOLATED publish snapshot, MAIN đọc lần đầu + `MutationObserver` → `FeatureFlags.applyRemote`. Ba cờ MAIN nay bật/tắt được qua popup (`READY` khi đã đăng ký).
- Nguyên nhân: hoàn tất chuỗi tích hợp (đăng ký động qua seam, thay trọn module YouTube v1, chốt cơ chế dataset).
- Tác động playback: engine **đã chạy** trong trang YouTube → cần theo dõi trong Phase 7; đường `executeScript` prune/skip/health của v1 đã retire.
- Kiểm thử (sandbox): unit **666 pass / 666** (62 file, 26 file `tests/unit/youtube/*`); `tsc --noEmit` pass. Hash (release `v1.2.0`): `dist/manifest.json` = `a129f517…d193`, `dist/youtube-main.js` = `5cacd7b7…dc9a`, `dist/youtube-isolated.js` = `65186805…c99f`.
- **Chưa xác minh (UNVERIFIED):** chặn quảng cáo YouTube trên Chrome thật, bảo toàn playback thật, A-2, A-4.
- Git: bump `1.1.1 → 1.2.0` (`0c974c3`); merge fast-forward vào `main` (`adb11f2..0c974c3`); **Release `v1.2.0`** (Latest) kèm `adblock-security-1.2.0.zip`. Đã xóa release/tag cũ (`v1.1.1`, `phase-P7-pending`, `phase-P4-done`, các tag `phase-P1..P7`).

## [Chưa phát hành] — 2026-11-27 — checkpoint Phase 7 (validation pending) (IMPLEMENTED / TESTED, chưa VERIFIED)
- Loại: **bàn giao implementation/validation-preparation**. **Không** phải bản stable hay production-ready.
- Module thay đổi: **không có code** — chỉ tài liệu và kế hoạch kiểm thử (checkpoint Git + release). Engine vẫn **INERT**; seam `isolated/registration.ts` **chưa được gọi**; ba cờ MAIN (`ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK`, `ENABLE_XHR_HOOK`) vẫn `WAITING_FOR_ADAPTER`.
- Nguyên nhân: chốt Git checkpoint + phát hành release cho trạng thái hiện tại sau khi Phase 0–6 hoàn tất / TESTED (unit); Phase 7 cần Chrome thật.
- Tác động playback: **không đổi** (engine chưa kích hoạt → zero regression; cũng chưa có giá trị chặn thực tế).
- Registry: `SELECTORS_VERSION` chưa đặt (selectors vẫn UNVERIFIED), `ENDPOINTS_VERSION` chưa đặt, `RULES_VERSION` chưa đặt.
- Kiểm thử (sandbox, Node + vitest): unit **652 pass / 652** (61 file, 25 file `tests/unit/youtube/*`); `tsc --noEmit` pass; `npm run build` pass, sinh `dist/youtube-main.js` (48.80 kB, IIFE). Hash `dist/manifest.json` = `c13a64de3a6c2185ea65abc57a76183429dddc381596b5e991d0cf6ef7a47426` (khớp kế hoạch Phase 7).
- **Chưa xác minh (UNVERIFIED):** chặn quảng cáo YouTube trên Chrome thật, bảo toàn playback thật, A-2 (MAIN đọc `chrome.storage`), A-4 (thứ tự `document_start`), T004 (cơ chế truyền cờ MAIN/ISOLATED — vẫn **OPEN**).
- Kế hoạch Phase 7: `specs/001-yt-ad-shield/verification/PHASE_7_REAL_CHROME_TEST_PLAN.md`; mẫu kết quả: `PHASE_7_TEST_RESULTS.md` (tất cả `NOT_RUN`).
- Git: checkpoint commit `chore(release): checkpoint YouTube validation pending`; tag/Release `phase-P7-pending` (prerelease, **không** kèm binary).

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
