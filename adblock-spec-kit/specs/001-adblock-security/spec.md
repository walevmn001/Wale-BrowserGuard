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
- Đồng bộ thống kê/log giữa thiết bị (chỉ cài đặt mới có thể đồng bộ, ở P6, tuỳ chọn).
- Bản mobile.
- VPN / antivirus.

## 5. Phi chức năng
- Riêng tư: không telemetry (Constitution II).
- Ổn định: service worker bị tắt/bật lại không mất cài đặt.
- Truy cập: popup dùng được bằng bàn phím.
- Ngôn ngữ giao diện: Tiếng Việt + Tiếng Anh.

---
## 6. Bổ sung: các chức năng mở rộng

### US-14 (P3): Bảo mật nâng cao
- AC-14.1: Cảnh báo khi tên miền giống tên miền thương hiệu lớn (typosquat/homoglyph) mà không phải tên miền chính thức; mức cảnh báo cao hơn nếu trang có ô mật khẩu.
- AC-14.2: Cảnh báo (không chặn) khi trang http có ô nhập mật khẩu (trừ localhost).
- AC-14.3: Chặn script đào tiền ảo ngầm (cryptojacking) theo danh sách.
- AC-14.4: Chặn popup/tab-under/redirect quảng cáo không do người dùng chủ động (mức Mạnh, có whitelist).

### US-8 (P4): Nút "Trang bị lỗi? Tắt 1 click"
- AC-8.1: 1 click tắt chặn cho trang hiện tại và tự tải lại; chọn thời hạn 1 giờ / hôm nay / mãi mãi.
- AC-8.2: Hết hạn thì tự bật lại, kể cả sau khi khởi động lại trình duyệt.

### US-9 (P4): Mức bảo vệ có sẵn
- AC-9.1: Ba mức Nhẹ / Chuẩn / Mạnh; mặc định Chuẩn; đổi mức áp dụng ngay.
- AC-9.2: Người dùng nâng cao vẫn bật/tắt riêng từng nhóm.

### US-10 (P4): Element picker
- AC-10.1: Người dùng bấm vào phần tử quảng cáo còn sót để ẩn; lưu theo domain.
- AC-10.2: Có xem trước, hoàn tác và xoá từng selector đã lưu.
- AC-10.3: Từ chối selector quá rộng (vd. `body`, chỉ tên thẻ).

### US-11 (P4): Ẩn banner cookie & popup phiền
- AC-11.1: Ẩn banner đồng ý cookie/popup đăng ký phổ biến theo danh sách.
- AC-11.2: Nếu trang bị khoá cuộn sau khi ẩn, mở khoá cuộn.

### US-12 (P4): Nhập/xuất & báo lỗi cục bộ
- AC-12.1: Xuất/nhập cài đặt, whitelist, selector tuỳ chỉnh ra file JSON có phiên bản và kiểm tra hợp lệ.
- AC-12.2: "Xuất báo cáo lỗi" tạo file cục bộ để người dùng tự đính kèm GitHub issue; KHÔNG gửi đi đâu.

### US-13 (P4): Trải nghiệm
- AC-13.1: Biểu tượng hiện số đã chặn của tab; phím tắt bật/tắt trang hiện tại.
- AC-13.2: Thống kê "tracker bị chặn nhiều nhất" (cục bộ).
- AC-13.3: Chế độ tối/sáng theo hệ thống; dùng được bằng bàn phím.

### US-15 (P5): Module chặn quảng cáo YouTube
- AC-15.1: Tách riêng, có công tắc bật/tắt; tắt thì không ảnh hưởng gì đến YouTube.
- AC-15.2: Tỉ lệ video phát không quảng cáo trong bộ test YouTube đạt mục tiêu "cố gắng tối đa" (best-effort), ghi số liệu cơ sở rồi theo dõi.
- AC-15.3: Không làm video lỗi/đứng hình: tỉ lệ lỗi phát ≤ 2% trong bộ test.
- AC-15.4: Tự động hạ cấp (tắt lớp can thiệp sâu) khi phát hiện video lỗi, và báo người dùng.
- AC-15.5: Cập nhật cấu hình/selector/tên trường bằng dữ liệu (không tải code) để sửa nhanh khi YouTube đổi.
- AC-15.6: Hiển thị rõ cho người dùng: tính năng này không đảm bảo, có thể vi phạm điều khoản của YouTube, và có thể ngừng hoạt động bất cứ lúc nào.

### US-16 (P6, tuỳ chọn, mặc định TẮT)
- AC-16.1: Quét extension đã cài và gắn cảnh báo theo quyền rủi ro (quyền `management` là tuỳ chọn, xin khi dùng); chỉ liệt kê, không tự tắt.
- AC-16.2: Đồng bộ CÀI ĐẶT giữa thiết bị qua cơ chế sync của trình duyệt; không đồng bộ thống kê/log; có thông báo rõ dữ liệu đi qua tài khoản trình duyệt.

### US-17 (P0/P7): Dự án
- AC-17.1: CI chạy lint + test + build mỗi lần push.
- AC-17.2: Có chính sách riêng tư, giấy phép, CHANGELOG trước khi phát hành.
