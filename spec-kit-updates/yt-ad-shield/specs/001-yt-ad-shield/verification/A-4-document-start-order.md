# Thủ tục xác minh A-4: thứ tự chạy MAIN và ISOLATED ở document_start

**Trạng thái kết quả:** UNVERIFIED. Chưa có lần chạy nào.
**Mục tiêu:** đo thứ tự thực tế, không giả định. Chọn cơ chế truyền cờ (T004) chỉ sau khi có kết quả.

## 1. Câu hỏi cần trả lời

1. Với điều hướng mới, world nào chạy trước: MAIN hay ISOLATED?
2. Với SPA, thứ tự có thay đổi không?
3. Snapshot cờ (nếu có) có sẵn trước khi hook MAIN cài đặt không?
4. Hook `fetch` và `ytInitialPlayerResponse` cài đặt trước hay sau khi YouTube đọc `ytInitialPlayerResponse` lần đầu?

## 2. Điều kiện cần ghi lại

Giống A-2 mục 2: phiên bản Chrome, OS, cấu hình extension, profile, số lần lặp, và có dùng DevTools mở hay không (ghi rõ vì DevTools có thể làm thay đổi thời điểm).

## 3. Thiết kế đo (instrumentation)

Mỗi world ghi sự kiện vào một bộ nhớ riêng, không dùng `console` làm nguồn dữ liệu chính vì `console` có thể bị lọc và làm chậm.

Schema sự kiện, mỗi bản ghi:

```
{ seq, world: "MAIN" | "ISOLATED", event, t: performance.now(), readyState, navigationType }
```

S�� kiện cần ghi:

- `script_start`: đầu file script của world.
- `hook_installed_fetch`, `hook_installed_initialresponse`: trong MAIN.
- `snapshot_available`: trong MAIN, khi nhận snapshot (nếu có cơ chế; trong thử nghiệm này có thể dùng mẫu giả).
- `storage_read_done`: trong ISOLATED, khi đọc xong `chrome.storage.sync`.
- `attribute_written`: trong ISOLATED, khi ghi thử một thuộc tính trên `document.documentElement`.
- `youtube_read_initial_response`: ghi bởi MAIN khi phát hiện YouTube đọc `ytInitialPlayerResponse` lần đầu (dùng accessor đã cài, không thêm getter mới ngoài mục đích đo).

Ràng buộc đo: instrumentation không được gọi `fetch` thật, không đổi thứ tự cài hook, không chờ đồng bộ nào làm thay đổi thời điểm sự kiện. Mỗi lần thêm đo phải kiểm tra lại không làm trễ `script_start`.

Phương pháp lấy dữ liệu: MAIN và ISOLATED ghi vào mảng riêng, kết quả được đọc sau khi trang tải xong qua DevTools (ví dụ `window.__a4Log`). Ghi rõ đây là phương pháp đọc sau, không phải đồng thời.

## 4. Quy trình

1. Tạo extension thử nghiệm có hai world, ghi theo schema mục 3.
2. Điều hướng mới đến `https://www.youtube.com/watch?v=<id>` (một video có quảng cáo trước nếu có, ghi lại id).
3. Đọc log sau khi trang tải xong.
4. Lặp lại tối thiểu 20 lần điều hướng mới. Ghi số lần có thứ tự khác nhau.
5. Thực hiện 20 chuyển video bằng SPA. Ghi nếu thứ tự đổi so với điều hướng mới.
6. Lặp với cấu hình có snapshot (đã đặt) và không có snapshot (xóa `chrome.storage.sync`).

## 5. Kết quả cần ghi

| Nhóm | Số lần | MAIN trước ISOLATED | ISOLATED trước MAIN | Không xác định | Ghi chú |
|------|--------|---------------------|---------------------|----------------|---------|
| Điều hướng mới, có snapshot | | | | | |
| Điều hướng mới, không snapshot | | | | | |
| SPA | | | | | |

Thêm bảng: vị trí `hook_installed_*` so với `youtube_read_initial_response`, cho mỗi nhóm: số lần hook cài trước, số lần sau.

## 6. Tiêu chí kết luận

- Chỉ kết luận "luôn MAIN trước" hoặc "luôn ISOLATED trước" khi số lần đo đủ (tối thiểu 20 mỗi nhóm) và không có ngoại lệ.
- Nếu có ngoại lệ, không được giả định thứ tự. Thiết kế phải chịu được cả hai thứ tự (xem `contracts/adapter.md` mục 7, các ca 6 và 7).
- Kết quả được dùng để chọn cơ chế truyền (T004). Không được chọn cơ chế trước khi có bảng kết quả.

## 7. Kết quả thực tế

Chưa có. Ngày chạy: —. Phiên bản Chrome: —. Trạng thái: UNVERIFIED.
