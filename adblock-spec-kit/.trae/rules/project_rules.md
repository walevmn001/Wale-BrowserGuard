# Project Rules — AdBlock Security Extension

Quy tắc này được nạp tự động ở mọi cuộc hội thoại. Tài liệu đầy đủ nằm ở:
`.specify/memory/constitution.md`, `specs/001-adblock-security/*`, `PROGRESS.md`.

## 0. Bắt đầu MỖI phiên (bắt buộc)
1. Đọc `PROGRESS.md` để biết đang ở giai đoạn/task nào. Tiếp tục từ đó, KHÔNG làm lại việc đã xong.
2. Chạy `git status` và `git log --oneline -5`. Nếu có thay đổi chưa commit từ phiên trước: kiểm tra, rồi commit hoặc báo tôi.
3. Đọc constitution. Chỉ làm task kế tiếp trong `tasks.md`.

## 1. Luật code
- Manifest V3, TypeScript strict, không `any`, file ≤ 300 dòng, hàm ≤ 50 dòng.
- Chặn mạng bằng declarativeNetRequest. Cấm `eval`, `new Function`, tải code từ xa, telemetry.
- Service worker không giữ state toàn cục; state nằm trong `chrome.storage`.
- Quyền tối thiểu; thêm quyền phải có lý do trong plan.md.
- Không đoán API: tra tài liệu chính thức hoặc ghi `TODO(verify)` và hỏi tôi.
- Ưu tiên "chặn thiếu" hơn "chặn nhầm" (không làm vỡ trang).

## 2. Quy trình
- Một task = một mục tiêu = một commit. Chỉ sửa file liệt kê trong task.
- Viết test cùng lúc với code. Xong task = lint + test + build đều xanh.
- Không refactor ngoài phạm vi, không thêm thư viện ngoài plan.md mục 6.
- Không bắt đầu task kế tiếp khi tôi chưa bảo. Báo cáo theo khuôn ở `prompts/06-implement-task.md`.

## 3. Git & sao lưu (chống mất dữ liệu / lỗi server / hết dung lượng)
- Sau MỖI task xanh: `git add -A && git commit -m "<TID>: <mô tả>" && git push origin main`.
- Cập nhật `PROGRESS.md` TRƯỚC khi commit (task vừa xong, task kế tiếp, ghi chú dở dang).
- Cuối mỗi giai đoạn (P1/P2/P3/P4): chạy test vàng, test xanh hết thì
  `git tag phase-<P>-done && git push origin main --tags`.
- Chỉ push khi build + test xanh. Nếu đang dở và test đỏ mà sắp hết phiên: commit vào nhánh `wip/<TID>` rồi push nhánh đó, KHÔNG đẩy code hỏng lên main. Ghi rõ vào `PROGRESS.md`.
- Không commit: `node_modules/`, file build, file bí mật (token, khoá), file lớn > 5MB. Tuân theo `.gitignore`.
- Nếu push thất bại (mạng/quyền): dừng, báo tôi lỗi nguyên văn, không tự ý `--force`.

## 4. Khi sắp hết ngữ cảnh / lỗi / bị ngắt
Trước khi dừng bất kỳ lý do gì, LUÔN cập nhật `PROGRESS.md` (mục "Dở dang") và commit + push. Mục tiêu: phiên mới chỉ cần đọc `PROGRESS.md` là làm tiếp được.

## 5. Ngôn ngữ
Trả lời tôi bằng tiếng Việt. Code, tên biến, commit message bằng tiếng Anh.
