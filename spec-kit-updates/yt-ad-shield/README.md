# YT Ad Shield

**Trạng thái:** đặc tả v5 · **checkpoint Phase 7 — validation pending**. Engine Phase 0–6 đã **IMPLEMENTED / TESTED** (unit) trong extension WALE GUARD tại `adblock-spec-kit/src/youtube/**`, đã **TÍCH HỢP / KÍCH HOẠT** trong extension (đăng ký động qua công tắc module), nhưng **chưa VERIFIED** trên YouTube/Chrome thật.

> **Đây là checkpoint bàn giao implementation/validation-preparation, KHÔNG phải bản stable hay production-ready.** Engine đã được **kích hoạt** (seam `isolated/registration.ts` được gọi từ service worker; T004 đã chốt) và thay trọn vai trò module YouTube v1 cũ; ba cờ MAIN truyền được sang trang qua thuộc tính `data-wg-yt-flags`; **chưa xác nhận khả năng chặn quảng cáo trên Chrome thật**. Phase 7 (`PENDING_REAL_CHROME_VALIDATION`) cần người dùng tự chạy theo `specs/001-yt-ad-shield/verification/PHASE_7_REAL_CHROME_TEST_PLAN.md` và điền `PHASE_7_TEST_RESULTS.md`.

- Engine mới là **đường chạy hiện hành**: service worker gọi `applyYouTubeEngineRegistration()` để đăng ký/gỡ hai content script qua `chrome.scripting.registerContentScripts` (`youtube-main.js` ở `world: 'MAIN'`, `youtube-isolated.js` ở `world: 'ISOLATED'`, `runAt: 'document_start'`), bật/tắt theo công tắc module, idempotent.
- Module YouTube cũ (`src/background/youtube-*.ts`, Q1–Q6) đã **ngừng được gọi** trong production (đường `executeScript` prune/skip/health cũ đã retire); file vẫn còn trong mã nguồn và unit test cũ.

## Truyền cờ MAIN ↔ ISOLATED (T004 đã chốt)

Ba hook chạy trong trang (MAIN world) gồm `ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK` và `ENABLE_XHR_HOOK` **nay bật/tắt được qua popup**.

- Cơ chế (phương án A): `youtube-isolated.js` ghi snapshot cờ vào thuộc tính JSON `data-wg-yt-flags` trên `<html>`; `youtube-main.js` đọc lần đầu + theo dõi `MutationObserver` rồi đưa qua `FeatureFlags.applyRemote`.
- Khi **chưa** có snapshot hợp lệ (ví dụ trang tải trước khi công tắc bật), ba hook chạy theo mặc định: **bật** (A-3), popup hiển thị `WAITING_FOR_ADAPTER`.
- Khi snapshot đã sẵn sàng và MAIN xác nhận hiệu lực, popup hiển thị `READY` (`ENABLED`/`DISABLED`) theo trạng thái thật; lưu lựa chọn tắt được áp dụng thật.

Các cờ còn lại (ví dụ `ENABLE_DNR`, `ENABLE_RUNTIME_GUARD`, `ENABLE_CSS_HIDER`) chạy ở phần cô lập và áp dụng bình thường qua `chrome.storage`.

## Những điều chưa được xác minh

- Chrome cho phép MAIN world đọc `chrome.storage` hay không (A-2): chưa xác minh.
- Thứ tự chạy giữa hai world ở `document_start` (A-4): chưa xác minh.
- Mọi selector, endpoint, khóa JSON và sự kiện YouTube: chưa xác minh. Xem `docs/SELECTORS.md` và `docs/ENDPOINTS.md`.
- Mọi ngưỡng số trong cấu hình là giá trị đề xuất, chưa đo.

## Cài đặt và kiểm tra

Không có bản dựng riêng: engine nằm trong extension WALE GUARD và được nạp cùng extension khi bật công tắc module.

Kiểm tra cục bộ engine mới:
```
cd adblock-spec-kit
npx vitest run tests/unit/youtube   # unit test engine (Phase 1–6)
npm run build                        # sinh dist/youtube-main.js + dist/youtube-isolated.js
npm run package                      # đóng gói zip release (đủ cả hai bundle engine)
```
Chi tiết tại `docs/TESTING.md`.

## Tài liệu

- Đặc tả: `specs/001-yt-ad-shield/spec.md`
- Kiến trúc: `docs/ARCHITECTURE.md`
- Tiến độ: `docs/PROGRESS.md`
- Ranh giới adapter: `specs/001-yt-ad-shield/contracts/adapter.md`
- Trạng thái popup: `specs/001-yt-ad-shield/contracts/popup-state.md`
- Trạng thái hạng mục: `specs/001-yt-ad-shield/status.md`
