# Thủ tục xác minh A-2: MAIN world có đọc được chrome.storage không

**Trạng thái kết quả:** UNVERIFIED. Chưa có lần chạy nào.
**Mục tiêu:** xác minh bằng thử nghiệm trên Chrome mục tiêu. Không đánh VERIFIED dựa trên tài liệu hay giả định.

## 1. Mục tiêu kiểm thử

Xác định một content script có `world: "MAIN"` có truy cập được `chrome.storage` hay không, và nếu có thì trong điều kiện nào.

## 2. Điều kiện cần ghi lại trước khi chạy

- Phiên bản Chrome: (điền, ví dụ `<số phiên bản đầy đủ>`).
- Hệ điều hành: (điền).
- Cấu hình extension: manifest version, danh sách content script, quyền khai báo.
- Ngữ cảnh chạy: trang `https://www.youtube.com/`, chế độ tải lại trang và điều hướng SPA.
- Trạng thái profile: mới hay đã dùng, extension đã cài dạng unpacked.

## 3. Extension thử nghiệm tối thiểu

Chỉ dùng để kiểm thử, không phải code sản phẩm.

- `manifest.json`: một content script MAIN và một content script ISOLATED, cùng `matches` `*://*.youtube.com/*`, `run_at: "document_start"`, quyền `storage`.
- Script MAIN: ghi kết quả của các phép thử sau vào `window.__a2Probe`:
  - `typeof chrome` (trong MAIN).
  - `typeof chrome?.storage` (trong MAIN).
  - Thử gọi `chrome.storage.sync.get` trong `try` và ghi lỗi nếu có.
- Script ISOLATED: ghi `typeof chrome.storage` và đặt một giá trị vào `chrome.storage.sync` để đối chiếu.

## 4. Quy trình

1. Cài extension thử nghiệm ở chế độ unpacked.
2. Đặt giá trị đánh dấu trong `chrome.storage.sync` từ ISOLATED.
3. Mở `https://www.youtube.com/` trong tab mới (điều hướng mới), chờ tải xong.
4. Trong DevTools của trang, đọc `window.__a2Probe`.
5. Lặp lại bước 3 đến 4 ít nhất ba lần.
6. Chuyển sang video khác bằng SPA (không tải lại trang), đọc `window.__a2Probe` nếu có ghi mới.

## 5. Kết quả cần ghi

| Lần | Điều hướng | typeof chrome (MAIN) | typeof chrome.storage (MAIN) | Lỗi gọi storage (MAIN) | Giá trị đọc được từ ISOLATED (nếu có) |
|-----|-----------|----------------------|------------------------------|------------------------|--------------------------------------|
| 1 | mới | | | | |
| 2 | mới | | | | |
| 3 | mới | | | | |
| 4 | SPA | | | | |

Kết luận chỉ được ghi là VERIFIED khi: có đủ phiên bản Chrome, cấu hình, bảng kết quả, và kết quả nhất quán qua các lần chạy. Nếu kết quả khác nhau giữa các lần, ghi là INCONSISTENT và giữ UNVERIFIED.

## 6. Hệ quả theo kết quả

- Nếu MAIN không truy cập được `chrome.storage` (kết quả mong đợi theo giả định): giữ nguyên kiến trúc hiện tại, adapter đọc snapshot từ ISOLATED.
- Nếu MAIN truy cập được: vẫn giữ adapter (để không phụ thuộc hành vi không tài liệu hóa). Ghi chú kết quả này vào `docs/COMPATIBILITY.md` và `contracts/adapter.md`.

## 7. Kết quả thực tế

Chưa có. Ngày chạy: —. Người chạy: —. Phiên bản Chrome: —. Trạng thái: UNVERIFIED.
