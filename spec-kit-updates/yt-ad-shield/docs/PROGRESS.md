# Tiến độ triển khai — YT Ad Shield (engine trong WALE GUARD)

Cập nhật: 2026-11-27

Trạng thái pha: **Phase 0–6 hoàn tất** (audit, kiến trúc/hợp đồng, interception, phát hiện & điều khiển quảng cáo, bảo vệ playback, vòng đời & tích hợp, tích hợp popup/cấu hình). Phase 7 **chưa bắt đầu**.

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
| 7 | Regression & Independent Validation | CHƯA BẮT ĐẦU | Cần Chrome thật |

## Đã triển khai (Phase 1–6)

- Engine TS ở `adblock-spec-kit/src/youtube/**` — 33 file nguồn.
- 25 file test ở `adblock-spec-kit/tests/unit/youtube/**`.
- Build pass thứ hai: `vite.youtube.config.ts` → `dist/youtube-main.js` (IIFE, 48.80 kB).
- Seam đăng ký MAIN: `src/youtube/isolated/registration.ts` (idempotent, fail-open, **chưa gọi**).
- Phase 4–5 gắn vào engine qua `main/runtime-modules.ts` (4 module tự-gate theo cờ riêng) và đăng ký trong `main/main.ts`.
- Phase 6: popup chia 6 layer (3 MAIN + 3 ISOLATED) qua `popup/yt-layers.ts`; nhóm MAIN dùng `NullAdapter` → luôn `WAITING_FOR_ADAPTER`; cờ ISOLATED lưu/nạp qua `chrome.storage.sync` (`isolated/settings.ts`, khóa `youtubeEngineFlags`).

## File thay đổi (Phase 0–6)

- Thêm mới (Phase 1–5): `adblock-spec-kit/src/youtube/**`, `adblock-spec-kit/tests/unit/youtube/**`, `adblock-spec-kit/vite.youtube.config.ts`.
- Thêm mới (Phase 6): `src/youtube/config/layers.ts`, `src/youtube/state/messages.ts`, `src/youtube/isolated/settings.ts`, `src/popup/yt-layers.ts` + 4 file test tương ứng.
- Sửa (Phase 6, SHARED tối thiểu): `src/youtube/state/toggle-state.ts` (dời `displayMessage` sang `state/messages.ts`), `src/popup/{elements,render,popup}.ts`, `src/popup/index.html`, `src/shared/i18n/{vi,en}.ts` (thêm 9 khóa).
- Sửa (SHARED tối thiểu): `adblock-spec-kit/package.json` (thêm build pass thứ hai vào `build` và `package`).
- Tài liệu: `spec-kit-updates/yt-ad-shield/**` (README, docs/*, specs/.../status.md).

## Kiểm thử đã chạy

| Lệnh | Kết quả |
|------|---------|
| `npx vitest run` | 652 passed / 652 (61 file) |
| `npx tsc --noEmit` | pass |
| `npm run build` | pass, sinh `dist/youtube-main.js` (48.80 kB) |

## Chưa triển khai

- Phase 7: Kiểm thử Chrome thật + regression ngoài YouTube.
- Các task phụ thuộc T004 (T016b, T061–T065, T073–T074) vẫn **BLOCKED**.

## Giả định chưa xác minh

- A-2: MAIN không đọc được `chrome.storage` — UNVERIFIED.
- A-4: thứ tự chạy hai world tại `document_start` — UNVERIFIED.
- Mọi selector, endpoint, khóa JSON quảng cáo, và ngưỡng `TUNING` — UNVERIFIED.
- T004 (cơ chế truyền cờ MAIN/ISOLATED) — **OPEN**.

## Rủi ro còn tồn tại

- Chưa có bằng chứng trên Chrome/YouTube thật cho bất kỳ hành vi playback nào.
- Kích hoạt engine (Phase 5–6) là thay đổi có rủi ro playback; phải sau khi Phase 4 + 7 xong.
- Hiện tại engine **chưa kích hoạt** → zero regression, nhưng cũng chưa có giá trị chặn thực tế.

## Git & push

- Commit Phase 0–3: `bad64af` (51 file, +4323/−42).
- Push lên `origin main`: **thành công** (`7bfdbde..bad64af main -> main`).
- Commit Phase 4–5: `60d9bc4` (23 file, +2514/−23).
- Push lên `origin main`: **thành công** (`f7b3c3a..60d9bc4 HEAD -> main`).
- Remote: `https://github.com/walevmn001/Wale-BrowserGuard`.
