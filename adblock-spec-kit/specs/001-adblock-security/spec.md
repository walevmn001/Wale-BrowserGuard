# Spec 001 — Extension chặn quảng cáo & bảo mật trình duyệt

> Chỉ mô tả LÀM GÌ và TẠI SAO. Không nêu công nghệ ở đây.

## 1. Mục tiêu
Một extension giúp người dùng duyệt web nhanh hơn, sạch hơn và an toàn hơn bằng cách chặn quảng cáo, trình theo dõi và các trang độc hại — mà không làm hỏng trang web và không thu thập dữ liệu người dùng.

## 2. Người dùng
- Người dùng phổ thông: bật là chạy, không cần cấu hình.
- Người dùng nâng cao: whitelist, tuỳ chỉnh rule, xem thống kê.

## 3. User stories & tiêu chí nghiệm thu

### US-1 (P1): Chặn quảng cáo & tracker mạng
- AC-1.1: Trên bộ test vàng, chặn ≥ 95% request quảng cáo/tracker đã biết.
- AC-1.2: Không làm vỡ layout/chức năng ở ≥ 98% trang trong bộ test vàng.
- AC-1.3: Độ trễ thêm vào điều hướng < 5ms (trung vị).
- AC-1.4: Hoạt động sau khi trình duyệt khởi động lại, không cần mở popup.

### US-2 (P1): Bật/tắt & whitelist theo trang
- AC-2.1: Popup có nút bật/tắt cho trang hiện tại; áp dụng trong ≤ 1 giây (sau reload trang).
- AC-2.2: Whitelist lưu lại sau khi khởi động lại trình duyệt.
- AC-2.3: Có thể tắt toàn bộ extension bằng 1 thao tác.

### US-3 (P1): Thống kê cục bộ
- AC-3.1: Popup hiện số request đã chặn của trang hiện tại và tổng cộng.
- AC-3.2: Dữ liệu chỉ ở máy người dùng; có nút xoá.

### US-4 (P2): Ẩn quảng cáo trên giao diện (cosmetic)
- AC-4.1: Ẩn khung/banner quảng cáo còn sót sau khi chặn mạng.
- AC-4.2: Bắt được quảng cáo chèn trễ (động) trong ≤ 1 giây.
- AC-4.3: Không chiếm > 5% CPU liên tục khi trang đứng yên.

### US-5 (P3): Bảo vệ khỏi trang độc hại
- AC-5.1: Chặn điều hướng/tải tài nguyên từ domain malware/phishing trong danh sách.
- AC-5.2: Hiện trang cảnh báo có nút "Quay lại" (và "Vẫn tiếp tục" cho người dùng nâng cao).
- AC-5.3: Danh sách cập nhật được mà không cần phát hành lại extension.

### US-6 (P3): Bảo mật & riêng tư nâng cao
- AC-6.1: Tự động nâng cấp http → https khi có thể (không lặp vô hạn, có ngoại lệ).
- AC-6.2: Loại bỏ tham số theo dõi phổ biến (utm_*, fbclid, gclid, …) khỏi URL.
- AC-6.3: Giảm thông tin Referer gửi sang trang khác.
- AC-6.4: Tuỳ chọn chặn rò IP qua WebRTC.
- AC-6.5: Tuỳ chọn chống fingerprint cơ bản (mặc định TẮT vì dễ làm vỡ trang).

### US-7 (P2): Cập nhật danh sách filter
- AC-7.1: Cập nhật theo lịch (mặc định mỗi 24h) hoặc thủ công.
- AC-7.2: Cập nhật thất bại không làm mất bộ rule hiện có.

## 4. Ngoài phạm vi (v1)
- Chặn quảng cáo video trong luồng (quảng cáo chèn phía server).
- Đồng bộ cài đặt giữa thiết bị.
- Bản mobile.
- VPN / antivirus.

## 5. Phi chức năng
- Riêng tư: không telemetry (Constitution II).
- Ổn định: service worker bị tắt/bật lại không mất cài đặt.
- Truy cập: popup dùng được bằng bàn phím.
- Ngôn ngữ giao diện: Tiếng Việt + Tiếng Anh.
