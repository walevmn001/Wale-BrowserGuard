# Bộ test vàng (Golden Test Suite)

Đo khách quan "chặn đúng" và "không vỡ trang". Chạy sau mỗi giai đoạn và trước release.

## 1. Danh sách trang (điền 30–50 URL thật)
| Nhóm | Số trang | Loại |
|------|----------|------|
| Báo/tin tức nhiều quảng cáo | 8 | báo điện tử VN & quốc tế |
| Video/streaming | 5 | trang xem video |
| Mua sắm | 6 | sàn thương mại điện tử |
| Mạng xã hội | 4 | feed, đăng nhập |
| Ngân hàng/thanh toán (KHÔNG được vỡ) | 5 | đăng nhập, thanh toán |
| Công cụ/Docs/Email | 6 | ứng dụng web phức tạp |
| Blog/diễn đàn nhỏ | 6 | nhiều script bên thứ ba |

## 2. Chỉ số
| Chỉ số | Cách đo | Ngưỡng |
|--------|---------|--------|
| Tỉ lệ chặn | request quảng cáo/tracker đã biết bị chặn / tổng | ≥ 95% |
| Tỉ lệ vỡ trang | trang lỗi chức năng/layout | ≤ 2% |
| Độ trễ điều hướng | trung vị load có/không extension | tăng < 5ms |
| Bộ nhớ | extension với bộ rule mặc định | < 100MB |
| CPU cosmetic | khi trang đứng yên 30s | < 5% |

## 3. Kịch bản mỗi trang
1. Mở trang, chờ load xong.
2. Chụp ảnh; kiểm tra chức năng chính (nút chính, video phát được).
3. Ghi số request bị chặn.
4. Bật whitelist → trang trở lại như gốc.

## 4. Quy tắc
- Lưu kết quả vào `tests/golden/results/<ngày>.json`.
- Tụt chỉ số nào so với lần trước → không merge.
- Trang bị vỡ → ghi rule gây lỗi → sửa/thêm ngoại lệ → chạy lại.

---
## 5. Bộ test YouTube (best-effort, P5)
Điền 5–10 video thật (video ngắn/dài, có quảng cáo trước/giữa video, kênh khác nhau, cả đã đăng nhập và chưa đăng nhập).

| Chỉ số | Cách đo | Mục tiêu |
|--------|---------|----------|
| Video không quảng cáo | số video phát thẳng không thấy quảng cáo / tổng | ghi cơ sở, không cam kết tuyệt đối |
| Lỗi phát | video đứng hình/lỗi / tổng | ≤ 2% |
| Hạ cấp tự động | module tự hạ cấp khi cố tình làm lỗi | hoạt động |
| Công tắc tắt | tắt module → YouTube như gốc | đạt |

Kiểm thử tự động dùng **trang mock** chứa player response có trường quảng cáo (xác định được); kiểm thử thật chạy thủ công và ghi số liệu theo ngày vào `tests/golden/results/`.

## 6. Bộ test chức năng bổ sung
- Tắt 1 click: hết hạn tự bật lại (kể cả sau restart).
- Element picker: từ chối selector `body`/tên thẻ/khớp > 20; hoàn tác hoạt động.
- Banner cookie: ẩn được và trang vẫn cuộn được.
- Giả mạo tên miền: bộ mẫu ≥ 30 tên giả (homoglyph, thêm/bớt ký tự) bị bắt; 50 tên miền hợp lệ KHÔNG bị báo (tỉ lệ báo sai ≤ 1%).
- Form mật khẩu http: báo trên trang http giả lập, không báo trên https/localhost.
- Popup guard: chặn `window.open` không có thao tác người dùng; cho phép khi người dùng bấm.
- Nhập/xuất: file hỏng/quá lớn bị từ chối, không đổi dữ liệu.
