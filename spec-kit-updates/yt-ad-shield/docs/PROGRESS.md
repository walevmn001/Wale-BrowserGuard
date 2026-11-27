# Tiến độ triển khai — YT Ad Shield (engine trong WALE GUARD)

Cập nhật: 2026-11-27

Trạng thái pha: **Phase 0–6 hoàn tất / TESTED (unit)** + **CHECKPOINT FIX-01 hoàn tất / TESTED (unit)** (activation thực sự, feature flags áp dụng đúng thứ tự, handshake trạng thái runtime MAIN→ISOLATED→popup). Phase 7 **PENDING_REAL_CHROME_VALIDATION** — kế hoạch kiểm thử và mẫu ghi kết quả đã bàn giao, đang **chờ người dùng tự chạy trên Chrome thật**; **chưa có kết quả PASS/FAIL nào**. Engine đã **TÍCH HỢP / KÍCH HOẠT** trong extension: seam `isolated/registration.ts` được service worker gọi (đăng ký động MAIN+ISOLATED theo công tắc module), T004 đã chốt (thuộc tính `data-wg-yt-flags`), module YouTube v1 đã retire khỏi production.

> **CHECKPOINT FIX-01 (2026-11-27):** sửa bốn nguyên nhân gốc khiến engine "build được nhưng không chạy" — (1) `initAll` chạy trước snapshot, (2) hook đọc flag một lần, (3) thiếu fact `installed`, (4) popup báo READY giả từ registration. Nay ba hook MAIN có trạng thái READY **thực sự** (dựa trên handshake `data-wg-yt-status`), popup phân biệt đủ 8 trạng thái, không còn `WAITING_FOR_ADAPTER` vô thời hạn khi adapter hoạt động. Chi tiết: `specs/001-yt-ad-shield/status.md` §18, kết quả test: `verification/FIX-01_TEST_RESULTS.md`, checklist Chrome: `verification/FIX-01_REAL_CHROME_CHECKLIST.md`.

## Bảng tiến độ theo Phase

| Phase | Nội dung | Trạng thái | Bằng chứng |
|-------|----------|------------|------------|
| 0 | Repository Audit & Baseline | DONE | Báo cáo phân loại YOUTUBE_OWNED / SHARED / NON_YOUTUBE; baseline 430 test |
| 1 | Architecture & Contracts | DONE (TESTED) | `src/youtube/config|core|registry|adapter|state`, `architecture.test.ts` |
| 2 | Core Interception | DONE (TESTED) | `json-pruner`, `player-response-hook`, `fetch-interceptor`, `xhr-interceptor` |
| 3 | Ad Detection & Control | DONE (TESTED) | `ad-detector`, `ad-state-machine`, `ad-action-controller`, `audio-state-manager` |
| 4 | Playback Protection | DONE (TESTED) | `playback-watchdog`, `playback-recovery`, `core/timers` |
| 5 | Lifecycle & Integration | DONE (TESTED) | `dom-observer`, `spa-navigation`, `dnr-manager`, `css-hider`, `main/runtime-modules.ts` |
| 6 | Popup & Configuration Integration | DONE (TESTED) | `config/layers.ts`, `state/messages.ts`, `isolated/settings.ts`, `popup/yt-layers.ts`; popup hiển thị 6 layer + `WAITING_FOR_ADAPTER` |
| 7 | Regression & Independent Validation | PENDING_REAL_CHROME_VALIDATION | Kế hoạch + mẫu kết quả tại `specs/001-yt-ad-shield/verification/PHASE_7_REAL_CHROME_TEST_PLAN.md` và `PHASE_7_TEST_RESULTS.md`; 24 ca đều `NOT_RUN`; cần Chrome thật |

## Đã triển khai (Phase 1–6)

- Engine TS ở `adblock-spec-kit/src/youtube/**` — 38 file nguồn TS (thêm `isolated/content-entry.ts`, `main/ad-control-module.ts` so với Phase 6).
- 26 file test ở `adblock-spec-kit/tests/unit/youtube/**` (thêm `dataset-adapter.test.ts`).
- Build pass thứ hai: `vite.youtube.config.ts` → `dist/youtube-main.js` (IIFE, ~58.7 kB).
- Build pass thứ ba: `vite.youtube-isolated.config.ts` → `dist/youtube-isolated.js` (IIFE, ~8.5 kB).
- Seam đăng ký: `src/youtube/isolated/registration.ts` — đăng ký/gỡ **cả hai** content script (`youtube-main.js` MAIN + `youtube-isolated.js` ISOLATED), idempotent, fail-open; service worker gọi `applyYouTubeEngineRegistration()` (đã **kích hoạt**).
- Truyền cờ (T004, phương án A): `adapter/dataset-adapter.ts` ghi/đọc thuộc tính JSON `data-wg-yt-flags` trên `<html>`; ISOLATED publish snapshot, MAIN đọc lần đầu + `MutationObserver` → `FeatureFlags.applyRemote`.
- Phase 4–5 gắn vào engine qua `main/runtime-modules.ts` (4 module tự-gate theo cờ riêng) và đăng ký trong `main/main.ts`; engine còn nối thêm module `ad-control` (parity skip của module v1).
- Phase 6: popup chia 6 layer (3 MAIN + 3 ISOLATED) qua `popup/yt-layers.ts`; nhóm MAIN dùng `DatasetAdapter` và `isEngineRegistered` → `READY` khi đã đăng ký, `WAITING_FOR_ADAPTER` khi chưa có snapshot hợp lệ; cờ ISOLATED lưu/nạp qua `chrome.storage.sync` (`isolated/settings.ts`, khóa `youtubeEngineFlags`).
- Module YouTube v1 (`src/background/youtube-*.ts`) đã retire khỏi production — không còn caller `createYouTubeModule`/`runYouTubeModule` trong `src/`.

## File thay đổi (Phase 0–6)

- Thêm mới (Phase 1–5): `adblock-spec-kit/src/youtube/**`, `adblock-spec-kit/tests/unit/youtube/**`, `adblock-spec-kit/vite.youtube.config.ts`.
- Thêm mới (Phase 6): `src/youtube/config/layers.ts`, `src/youtube/state/messages.ts`, `src/youtube/isolated/settings.ts`, `src/popup/yt-layers.ts` + 4 file test tương ứng.
- Sửa (Phase 6, SHARED tối thiểu): `src/youtube/state/toggle-state.ts` (dời `displayMessage` sang `state/messages.ts`), `src/popup/{elements,render,popup}.ts`, `src/popup/index.html`, `src/shared/i18n/{vi,en}.ts` (thêm 9 khóa).
- Sửa (SHARED tối thiểu): `adblock-spec-kit/package.json` (thêm build pass thứ hai vào `build` và `package`).
- Tài liệu: `spec-kit-updates/yt-ad-shield/**` (README, docs/*, specs/.../status.md).

## Kiểm thử đã chạy

| Lệnh | Kết quả |
|------|---------|
| `npx vitest run` | 708 passed / 708 (65 file) — sau FIX-01 (trước: 666/666) |
| `npx tsc --noEmit` | pass |
| `npm run build` | pass, sinh `dist/youtube-main.js` (~65.6 kB) + `dist/youtube-isolated.js` (~12.1 kB) |
| `npm run package` | pass, zip release chứa **đủ** cả hai bundle engine |

## Phase 7 — Trạng thái bàn giao (PENDING_REAL_CHROME_VALIDATION)

- **Chưa chạy** bất kỳ ca Phase 7 nào. Đã bàn giao kế hoạch + mẫu kết quả để người dùng tự chạy.
- Kế hoạch: `specs/001-yt-ad-shield/verification/PHASE_7_REAL_CHROME_TEST_PLAN.md` (24 ca: setup, xác nhận trạng thái engine, ba cờ MAIN truyền/nhận snapshot, bảo toàn playback A/B, regression ngoài YouTube, T066/A-2, T067/A-4). Kế hoạch gốc viết trước khi kích hoạt; khi chạy cần đọc ba cờ MAIN ở trạng thái đã kích hoạt thay vì `WAITING_FOR_ADAPTER` mặc định.
- Mẫu kết quả: `specs/001-yt-ad-shield/verification/PHASE_7_TEST_RESULTS.md` (tất cả ô = `NOT_RUN`).
- Artifact đối chiếu (release `v1.2.0`): `dist/manifest.json` SHA-256 `a129f517…d193` (version `1.2.0`); `dist/youtube-main.js` SHA-256 `5cacd7b7…dc9a`; `dist/youtube-isolated.js` SHA-256 `65186805…c99f`. Hash `youtube-main.js` đã đổi so với checkpoint trước kích hoạt (từ `154b4612…3a97`) do engine nay nối thêm DatasetAdapter + ad-control.
- **Chưa xác nhận khả năng chặn quảng cáo YouTube trên Chrome thật** — engine đã kích hoạt nhưng chưa có kết quả chạy thật.

## Chưa triển khai

- Phase 7: Kiểm thử Chrome thật + regression ngoài YouTube (PENDING_REAL_CHROME_VALIDATION).
- Các task phụ thuộc T004 (T016b, T061–T065, T073–T074): T004 **đã chốt** nên không còn bị chặn về mặt cơ chế; các ca kiểm thử Chrome thật (T066/A-2, T067/A-4) vẫn chờ Phase 7.

## Giả định chưa xác minh

- A-2: MAIN không đọc được `chrome.storage` — UNVERIFIED.
- A-4: thứ tự chạy hai world tại `document_start` — UNVERIFIED.
- Mọi selector, endpoint, khóa JSON quảng cáo, và ngưỡng `TUNING` — UNVERIFIED.
- T004 (cơ chế truyền cờ MAIN/ISOLATED) — **CLOSED** (chọn phương án A: thuộc tính `data-wg-yt-flags`).

## Rủi ro còn tồn tại

- Chưa có bằng chứng trên Chrome/YouTube thật cho bất kỳ hành vi playback nào.
- Engine đã được **kích hoạt** (thay trọn module v1), nên rủi ro playback cần theo dõi trong Phase 7.
- Engine đã có giá trị chặn trên lý thuyết, nhưng **chưa xác nhận trên Chrome thật**.

## Git & push

- Commit Phase 0–3: `bad64af` (51 file, +4323/−42).
- Push lên `origin main`: **thành công** (`7bfdbde..bad64af main -> main`).
- Commit Phase 4–5: `60d9bc4` (23 file, +2514/−23).
- Push lên `origin main`: **thành công** (`f7b3c3a..60d9bc4 HEAD -> main`).
- Commit Phase 6: `2c60594` (22 file, +916/−74).
- Push lên `origin main`: **thành công** (`f7ced95..2c60594 HEAD -> main`).
- Commit checkpoint Phase 7 (validation pending): `chore(release): checkpoint YouTube validation pending` → tag/Release `phase-P7-pending` (hash ghi trong release notes và `git log`).
- Commit tích hợp/kích hoạt engine (v10): `76b1417` — `feat(youtube): tích hợp và kích hoạt engine YT Ad Shield vào WALE GUARD` (29 file, +968/−195).
- Push: **thành công** lên nhánh `trae/agent-scTM9F` (`d1b85e3..76b1417 trae/agent-scTM9F -> trae/agent-scTM9F`).
- Bump phiên bản `1.1.1 → 1.2.0`: `0c974c3` — `chore(release): bump WALE GUARD to 1.2.0 (YouTube engine integrated)` (`manifest.config.ts`, `package.json`, `package-lock.json`, `CHANGELOG.md`).
- Merge fast-forward nhánh → `main` và push `main`: **thành công** (`adb11f2..0c974c3 main -> main`).
- **Release GitHub `v1.2.0`** (Latest, target `main`) kèm asset `adblock-security-1.2.0.zip`.
- Đã **xóa** các release/tag cũ (theo yêu cầu): release `v1.1.1`, `phase-P7-pending`, `phase-P4-done` (kèm tag) và các tag `phase-P1-done`…`phase-P7-done`. Hiện chỉ còn release/tag `v1.2.0`.
- Remote: `https://github.com/walevmn001/Wale-BrowserGuard`.

### Git cho CHECKPOINT FIX-01

- Commit Phase B+C (activation thực sự + handshake trạng thái runtime): `5ac4299` — `feat(youtube): kích hoạt engine + handshake trạng thái runtime (FIX-01 B/C)` (20 file).
- Commit Phase D (kiểm thử độc lập): `9a8e523` — `test(youtube): kiểm thử độc lập cho activation, handshake & feature flags (FIX-01 D)` (5 file).
- Commit Phase E/G (tài liệu + checklist Chrome + package): xem `git log` nhánh `trae/agent-scTM9F`.
- Nhánh làm việc: `trae/agent-scTM9F` — **không** push thẳng `main`, không force-push.
