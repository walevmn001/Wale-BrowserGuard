# UI/UX Spec — phong cách trắng + xanh mint, hiện đại, gọn

Tên sản phẩm trong nguyên mẫu là **MintShield** (tên tạm, đổi tuỳ ý). Nguyên mẫu trực quan nằm ở thư mục `ui/` (mở `ui/popup.html`, `ui/options.html`, `ui/warning.html` bằng trình duyệt để xem). Đây là chuẩn thiết kế; code thật nằm trong `src/`.

## 1. Nguyên tắc
1. **Gọn**: popup trả lời 3 câu hỏi trong 1 giây: đang bảo vệ không? đã chặn bao nhiêu? tắt/bật thế nào?
2. **Một hành động chính** mỗi màn hình. Thứ nâng cao ẩn ở Cài đặt.
3. **Không làm người dùng sợ**: màu mint = an toàn; đỏ chỉ dùng cho cảnh báo thật sự.
4. **Dễ tiếp cận**: tương phản đạt chuẩn, dùng được bằng bàn phím, tôn trọng giảm chuyển động.
5. **Không tải tài nguyên ngoài** (font/ảnh/CDN): chỉ dùng font hệ thống và SVG nội tuyến.

## 2. Bảng màu (token ở `ui/design-tokens.css`)
| Token | Sáng | Dùng cho |
|-------|------|----------|
| `--bg` | #FFFFFF | nền trang |
| `--surface` | #F6FBF9 | nền phụ, thanh điều hướng |
| `--mint-100` / `--mint-50` | #E3F8F1 / #F3FCF9 | thẻ nhấn, chip, hero |
| `--mint-500` | #0FA37D | công tắc bật, icon, viền chọn |
| `--mint-600` | #0B8466 | nút chính, chữ nhấn (chữ trắng ≥ 4.5:1) |
| `--ink` / `--muted` | #0F2A24 / #5B7A72 | chữ chính / chữ phụ |
| `--danger`, `--warn` | #C93B3B, #8A5A00 | cảnh báo (chỉ khi cần) |
Chế độ tối: tự theo hệ thống, có công tắc thủ công (`data-theme="light|dark"`). Nút chính ở chế độ tối dùng nền mint sáng + chữ đậm.

## 3. Chữ & khoảng cách & hình khối
- Font: `system-ui` (không tải font). Cỡ: 22 (tiêu đề trang) / 16 (mục) / 14 (thân) / 12 (phụ).
- Lưới khoảng cách 4/8/12/16/24/32. Bo góc 8/12/16, nút dạng **viên thuốc** (pill).
- Bóng nhẹ (`--shadow-1`), viền 1px `--line`; không dùng bóng đậm hay gradient loè loẹt (chỉ hero popup có gradient mint rất nhạt).
- Chuyển động 120–200ms; tắt hoàn toàn khi `prefers-reduced-motion`.

## 4. Màn hình
### 4.1 Popup (360px rộng, cao tối đa ~560px, cuộn nội bộ nếu quá)
Thứ tự từ trên xuống: Header (logo + tên, nút cài đặt) → **Thẻ hero** (favicon, domain, trạng thái "Đang được bảo vệ", công tắc lớn bật/tắt trang) → **2 ô thống kê** (chặn ở trang này / tổng) → **Mức bảo vệ** (phân đoạn Nhẹ/Chuẩn/Mạnh) → **Thẻ danh sách công tắc** (Ẩn quảng cáo, Chống theo dõi, YouTube kèm chip "Thử nghiệm") → **Hành động** ("Trang bị lỗi? Tắt tạm", chọn 1 giờ/Hôm nay/Mãi mãi, "Ẩn một phần tử") → Footer (phiên bản, "Báo lỗi").
Trạng thái: bật (mint) · tắt cho trang này (hero xám, chữ "Đã tạm tắt đến …", nút "Bật lại") · trang không hỗ trợ (chrome://, store) hiện thông báo gọn, công tắc bị vô hiệu · đang tải (khung xương, không spinner dài).

### 4.2 Trang cài đặt (options)
Bố cục 2 cột: thanh điều hướng trái (Tổng quan, Bộ lọc, Trang được phép, Ẩn phần tử, Bảo mật, YouTube, Nâng cao, Giới thiệu) + nội dung tối đa 820px. Di động/nhỏ: thanh điều hướng chuyển lên trên.
Mỗi mục là một **thẻ**; mức bảo vệ là 3 thẻ chọn; bộ lọc hiển thị thời điểm cập nhật + số quy tắc; YouTube có banner cảnh báo rủi ro; Nhập/Xuất ở mục Nâng cao.

### 4.3 Trang cảnh báo (malware / giả mạo)
Thẻ giữa trang, biểu tượng cảnh báo tròn đỏ nhạt, tiêu đề ngắn, hiện domain, lý do, nút chính **"Quay lại an toàn"** (mint, nổi bật), nút phụ chữ đỏ "Tôi hiểu rủi ro, vẫn tiếp tục (10 phút)".

### 4.4 Thành phần chèn vào trang web (picker, banner cảnh báo)
- Bắt buộc dùng **Shadow DOM** để CSS của trang không làm hỏng giao diện và ngược lại.
- Element picker: viền highlight mint 2px + nhãn nhỏ hiện selector; thanh công cụ nổi dưới cùng (Xác nhận / Hoàn tác / Huỷ). Selector bị từ chối hiện thông báo rõ lý do.
- Banner cảnh báo (form mật khẩu http, tên miền nghi giả mạo): thanh mảnh đầu trang, màu warn, có nút đóng và "Tin tưởng trang này".

### 4.5 Biểu tượng
`ui/icon.svg` (khiên mint + dấu tick). Xuất PNG 16/32/48/128 cho manifest. Biểu tượng thanh công cụ có badge số đã chặn (nền mint đậm, chữ trắng); khi tắt cho trang: xám.

## 5. Nội dung chữ (vi mặc định, có en)
Giọng điệu ngắn, thân thiện, không thuật ngữ. Mọi chuỗi qua i18n (`_locales/vi`, `_locales/en`), không viết cứng trong HTML/TS.
Ví dụ khoá: `status_protected`, `status_paused_until`, `level_light|standard|strong`, `pause_report_broken`, `pause_1h|today|forever`, `youtube_experimental_note`, `warning_title`, `warning_back_safe`, `warning_continue_10m`.

## 6. Tiêu chí nghiệm thu UI
- AC-UI-1: Popup mở < 150ms, không nhấp nháy bố cục.
- AC-UI-2: Mọi chữ đạt tương phản ≥ 4.5:1; thành phần điều khiển ≥ 3:1, cả hai chế độ sáng/tối.
- AC-UI-3: Dùng được 100% bằng bàn phím (Tab, Space/Enter, mũi tên cho phân đoạn); có vòng focus rõ.
- AC-UI-4: Công tắc có `role="switch"` và nhãn truy cập; phân đoạn là `radiogroup`.
- AC-UI-5: Không request mạng nào để dựng giao diện (không CDN/font/ảnh ngoài).
- AC-UI-6: Giao diện không vỡ ở chữ phóng to 125% và ở cả vi/en (chuỗi dài).
- AC-UI-7: Thành phần chèn vào trang không bị CSS trang ảnh hưởng (Shadow DOM) và không làm vỡ trang.

## 7. Tasks UI (thêm vào `tasks.md`, giai đoạn UI — chạy được độc lập với P5/P6)
- **T070** Đưa `design-tokens.css`, `components.css`, `icon.svg` vào `src/shared/ui/`; cấu hình build copy; xuất icon PNG 16/32/48/128 (công cụ sinh PNG dev-only phải được duyệt ở plan §6, hoặc xuất thủ công). Xong: manifest có icon, trang nạp được CSS.
- **T071** Làm lại **popup** theo `ui/popup.html` (giữ nguyên logic đã có; nối công tắc/mức/tắt tạm/ẩn phần tử với module sẵn có). Không inline script. E2E: các thao tác chính vẫn chạy.
- **T072** Làm lại **options** theo `ui/options.html` (điều hướng, thẻ mức bảo vệ, bộ lọc, whitelist, YouTube, nhập/xuất).
- **T073** Làm lại **warning page** theo `ui/warning.html`; nút hoạt động đúng thuật toán F.
- **T074** Giao diện **picker + banner cảnh báo** bằng Shadow DOM. E2E trên trang có CSS xung đột: không bị ảnh hưởng.
- **T075** i18n đầy đủ vi/en cho mọi chuỗi UI; kiểm tra chuỗi dài không vỡ.
- **T076** Chế độ tối/sáng + hoàn thiện truy cập (tương phản, bàn phím, giảm chuyển động).
- **T077** Kiểm thử: e2e mọi trang render không lỗi console; ảnh chụp chuẩn (Playwright `toHaveScreenshot`) cho popup/options/warning ở sáng + tối.
