# YT Ad Shield

**Trạng thái:** đặc tả v5. Engine Phase 1–3 đã **IMPLEMENTED / TESTED** (unit) trong extension WALE GUARD tại `adblock-spec-kit/src/youtube/**`, nhưng **chưa kích hoạt** và **chưa VERIFIED** trên YouTube/Chrome thật.

- Engine mới chạy song song, đăng ký qua `chrome.scripting.registerContentScripts` (`world: 'MAIN'`, `runAt: 'document_start'`) nhưng **seam chưa được gọi** từ worker → hành vi hiện tại của extension không đổi.
- Module YouTube cũ (`src/background/youtube-*.ts`, Q1–Q6) vẫn là đường chạy hiện hành.

## Hành vi chờ adapter (quan trọng)

Ba hook chạy trong trang (MAIN world) gồm `ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK` và `ENABLE_XHR_HOOK` hiện chưa thể tắt qua popup.

- Khi chưa có snapshot cấu hình hợp lệ, ba hook này chạy theo mặc định: **bật**.
- Popup hiển thị chúng ở trạng thái **Chờ adapter**. Popup không hiển thị chúng là "đã tắt" khi hiệu lực vẫn là bật.
- Khi bạn lưu lựa chọn tắt cho các hook này, lựa chọn được lưu nhưng **chưa được áp dụng**. Popup nói rõ điều này.
- Lý do: cơ chế truyền cờ từ phần cô lập (ISOLATED) sang trang (MAIN) chưa được chốt (quyết định T004).

Các cờ còn lại (ví dụ `ENABLE_DNR`, `ENABLE_RUNTIME_GUARD`) chạy ở phần cô lập và áp dụng bình thường qua `chrome.storage`.

## Những điều chưa được xác minh

- Chrome cho phép MAIN world đọc `chrome.storage` hay không (A-2): chưa xác minh.
- Thứ tự chạy giữa hai world ở `document_start` (A-4): chưa xác minh.
- Mọi selector, endpoint, khóa JSON và sự kiện YouTube: chưa xác minh. Xem `docs/SELECTORS.md` và `docs/ENDPOINTS.md`.
- Mọi ngưỡng số trong cấu hình là giá trị đề xuất, chưa đo.

## Cài đặt và kiểm tra

Chưa có bản dựng riêng để cài (engine nằm trong extension WALE GUARD và chưa được kích hoạt). 

Kiểm tra cục bộ engine mới:
```
cd adblock-spec-kit
npx vitest run tests/unit/youtube   # unit test engine (Phase 1–3)
npm run build                        # sinh dist/youtube-main.js
```
Chi tiết tại `docs/TESTING.md`.

## Tài liệu

- Đặc tả: `specs/001-yt-ad-shield/spec.md`
- Kiến trúc: `docs/ARCHITECTURE.md`
- Tiến độ: `docs/PROGRESS.md`
- Ranh giới adapter: `specs/001-yt-ad-shield/contracts/adapter.md`
- Trạng thái popup: `specs/001-yt-ad-shield/contracts/popup-state.md`
- Trạng thái hạng mục: `specs/001-yt-ad-shield/status.md`
