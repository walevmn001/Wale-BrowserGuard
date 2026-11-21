# Prompt 11 — Làm việc với module YouTube (P5)

Bối cảnh bắt buộc: constitution (đặc biệt mục VI), plan.md (Phụ lục), algorithm.md mục Q, tasks T060–T069.

Quy tắc riêng cho module này:
1. Mọi can thiệp trang phải **fail-open**: có lỗi thì trả dữ liệu gốc, không bao giờ làm hỏng video.
2. Endpoint, selector, tên trường quảng cáo là **dữ liệu** trong `data/youtube-config.json`, không viết cứng trong code.
3. KHÔNG chặn endpoint phát video chính. Mỗi rule mới phải có test "video vẫn phát".
4. Phát triển và test bằng **trang mock** trước. Mọi giá trị đánh dấu `TODO(verify)` phải được tôi kiểm chứng trên trang thật; nếu bạn không truy cập được YouTube thật, hãy liệt kê chính xác những gì tôi cần kiểm tra (DevTools) thay vì đoán.
5. Mỗi lớp (Q1–Q6) là một task riêng, một commit riêng; có thể tắt từng lớp bằng cờ.
6. Không dùng `eval`/`new Function`, không gửi dữ liệu ra ngoài, không tải code từ xa.
7. Đây là tính năng best-effort: không hứa tỉ lệ chặn tuyệt đối trong tài liệu hay giao diện.
