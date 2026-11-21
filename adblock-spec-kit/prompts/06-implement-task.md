# Prompt 06 — Implement 1 task (dùng lặp lại, thay {TASK_ID})

Bối cảnh bắt buộc: `.specify/memory/constitution.md`, `specs/001-adblock-security/plan.md`, `algorithm.md`, và mục {TASK_ID} trong `tasks.md`.

Thực hiện DUY NHẤT task {TASK_ID}.

Quy tắc:
1. Chỉ sửa/tạo các file liệt kê trong task. Không refactor, không thêm thư viện ngoài plan.
2. Viết test TRƯỚC (hoặc cùng lúc), rồi mới viết code.
3. Không đoán API. Nếu chưa chắc, tra tài liệu chính thức hoặc ghi `TODO(verify)` và hỏi tôi.
4. TypeScript strict, không `any`, file ≤ 300 dòng, hàm ≤ 50 dòng.
5. Không giữ state trong biến toàn cục của service worker.
6. Chạy: lint, test, build. Dán kết quả lệnh.

Khi xong, báo cáo đúng khuôn:
- File đã tạo/sửa
- Test đã thêm và kết quả
- Tiêu chí xong của task: đạt/chưa (từng mục)
- Điều bất định hoặc rủi ro còn lại
- Gợi ý commit message
KHÔNG bắt đầu task tiếp theo.
