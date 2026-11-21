# Prompt 12 — Làm giao diện (UI/UX) theo thiết kế trắng + xanh mint

Bối cảnh bắt buộc: constitution, `.trae/rules/project_rules.md`, `PROGRESS.md`, `specs/001-adblock-security/ui-ux.md`, và thư mục `ui/` (nguyên mẫu HTML/CSS: popup, options, warning, design-tokens, components, icon).

Bước 0 (chỉ làm một lần, chưa code):
1. Thêm mục "Tasks UI" từ `ui-ux.md` §7 (T070–T077) vào cuối `tasks.md`, và ghi vào `PROGRESS.md`.
2. Báo cáo: logic hiện có (popup, options, warning…) đang nằm ở file nào, để biết phần nào cần nối vào giao diện mới.

Sau đó làm **MỖI LẦN MỘT TASK** (T070 → T077), theo quy trình prompt 06:
- Giao diện mới phải **giữ nguyên hành vi** đã có; chỉ đổi cách trình bày. Không refactor logic ngoài phạm vi.
- Dùng đúng token/thành phần trong `ui/design-tokens.css` và `ui/components.css`; không tự bịa màu mới. Màu chủ đạo: trắng + xanh mint.
- Không CDN/font/ảnh từ xa; không inline script (MV3); không thêm thư viện UI/framework.
- Truy cập: `role="switch"`, `radiogroup`, focus rõ, tương phản đạt chuẩn, hỗ trợ `prefers-reduced-motion`.
- Mọi chuỗi qua i18n vi/en.
- Thành phần chèn vào trang web phải dùng Shadow DOM.
- Xong task: lint + test + build xanh, e2e hiện có vẫn xanh, cập nhật `PROGRESS.md`, commit, push `main`. Dừng chờ tôi duyệt trước khi sang task kế.
- Nếu một chỗ trong nguyên mẫu mâu thuẫn với logic thật hoặc quyền/luật constitution, nêu mâu thuẫn thay vì tự quyết.
