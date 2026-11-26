# Tiến độ triển khai — YT Ad Shield (engine trong WALE GUARD)

Cập nhật: 2026-11-27

Trạng thái pha: **Phase 0–3 hoàn tất** (audit, kiến trúc/hợp đồng, interception, phát hiện & điều khiển quảng cáo, một phần bảo vệ playback). Phase 4–7 **chưa bắt đầu**.

## Bảng tiến độ theo Phase

| Phase | Nội dung | Trạng thái | Bằng chứng |
|-------|----------|------------|------------|
| 0 | Repository Audit & Baseline | DONE | Báo cáo phân loại YOUTUBE_OWNED / SHARED / NON_YOUTUBE; baseline 430 test |
| 1 | Architecture & Contracts | DONE (TESTED) | `src/youtube/config|core|registry|adapter|state`, `architecture.test.ts` |
| 2 | Core Interception | DONE (TESTED) | `json-pruner`, `player-response-hook`, `fetch-interceptor`, `xhr-interceptor` |
| 3 | Ad Detection & Control | DONE (TESTED) | `ad-detector`, `ad-state-machine`, `ad-action-controller`, `audio-state-manager` |
| 4 | Playback Protection | CHƯA BẮT ĐẦU | Watchdog/Recovery mới là stub đặc tả |
| 5 | Lifecycle & Integration | CHƯA BẮT ĐẦU | DOM Observer, SPA Nav, DNR Manager, CSS Hider |
| 6 | Popup & Configuration Integration | CHƯA BẮT ĐẦU | 3 cờ MAIN + `WAITING_FOR_ADAPTER` |
| 7 | Regression & Independent Validation | CHƯA BẮT ĐẦU | Cần Chrome thật |

## Đã triển khai (Phase 1–3)

- Engine TS ở `adblock-spec-kit/src/youtube/**` — 22 file nguồn.
- 14 file test ở `adblock-spec-kit/tests/unit/youtube/**`.
- Build pass thứ hai: `vite.youtube.config.ts` → `dist/youtube-main.js` (IIFE, 25.08 kB).
- Seam đăng ký MAIN: `src/youtube/isolated/registration.ts` (idempotent, fail-open, **chưa gọi**).

## File thay đổi (Phase 0–3)

- Thêm mới: `adblock-spec-kit/src/youtube/**`, `adblock-spec-kit/tests/unit/youtube/**`, `adblock-spec-kit/vite.youtube.config.ts`.
- Sửa (SHARED tối thiểu): `adblock-spec-kit/package.json` (thêm build pass thứ hai vào `build` và `package`).
- Tài liệu: `spec-kit-updates/yt-ad-shield/**` (README, docs/*, specs/.../status.md).

## Kiểm thử đã chạy

| Lệnh | Kết quả |
|------|---------|
| `npx vitest run` | 563 passed / 563 (50 file) |
| `npx tsc --noEmit` | pass |
| `npm run build` | pass, sinh `dist/youtube-main.js` |

## Chưa triển khai

- Phase 4: Playback Watchdog, Playback Recovery (chẩn đoán, timeout/cooldown/retry).
- Phase 5: DOM Observer, SPA Navigation, DNR Manager (áp dụng/rollback), CSS Hider.
- Phase 6: Tích hợp worker + popup 3 cờ MAIN.
- Phase 7: Kiểm thử Chrome thật + regression ngoài YouTube.

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

- Commit Phase 0–3: `PENDING` (sẽ cập nhật sau khi commit).
- Push lên `origin main`: `PENDING`.
- Remote: `https://github.com/walevmn001/Wale-BrowserGuard`.
