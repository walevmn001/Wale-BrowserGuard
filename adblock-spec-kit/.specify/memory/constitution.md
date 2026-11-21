# Constitution — AdBlock Security Extension

Luật bất biến. Mọi code, mọi task PHẢI tuân thủ. Vi phạm = từ chối và làm lại.

## I. Nền tảng
1. Chuẩn **Manifest V3**. Mục tiêu chính: Chrome/Edge/Brave (Chromium); Firefox là mục tiêu phụ (giai đoạn sau).
2. Ngôn ngữ: **TypeScript strict**. Build: Vite (hoặc esbuild). Test: Vitest (unit) + Playwright (e2e có nạp extension).
3. Chặn mạng dùng **declarativeNetRequest (DNR)** là chính. Không dựa vào webRequest blocking (MV3 không hỗ trợ trên Chromium).

## II. Quyền riêng tư & bảo mật (không thương lượng)
4. **Không thu thập, không gửi** bất kỳ dữ liệu duyệt web nào ra ngoài. Không analytics, không telemetry.
5. Thống kê (số request đã chặn) chỉ lưu **cục bộ** (`chrome.storage.local`).
6. Quyền (permissions) **tối thiểu**. Mỗi quyền thêm vào phải ghi lý do trong `plan.md`. Ưu tiên `optional_permissions`.
7. Cấm: `eval`, `new Function`, `innerHTML` với dữ liệu không tin cậy, tải & chạy code từ xa, inline script.
8. Danh sách filter cập nhật từ nguồn ngoài: chỉ tải **dữ liệu (rule)**, không tải code; kiểm tra checksum/phiên bản; có thể chạy offline với bản đóng gói sẵn.
9. Mọi input từ trang web/người dùng/filter list đều là **không tin cậy**: validate + giới hạn kích thước.
10. Content script không được rò dữ liệu trang về service worker ngoài mục đích đã khai báo trong spec.

## III. Chất lượng & ổn định
11. Mỗi module: có **unit test**. Mỗi tính năng người dùng thấy được: có **e2e test**.
12. Một file ≤ 300 dòng; một hàm ≤ 50 dòng; không `any` (trừ khi có comment lý do).
13. **Không làm vỡ trang**: ưu tiên "chặn thiếu" hơn "chặn nhầm". Mặc định chọn an toàn; chế độ mạnh là opt-in.
14. Service worker MV3 có thể bị tắt bất kỳ lúc nào: **không giữ state trong biến toàn cục**; mọi state quan trọng nằm trong `chrome.storage`.
15. Hiệu năng: thêm độ trễ điều hướng trang < 5ms (trung vị); bộ nhớ extension < 100MB với bộ rule mặc định.
16. Lỗi phải được bắt và log cục bộ; một module hỏng không được làm sập module khác.

## IV. Quy trình
17. Thứ tự bắt buộc: spec → clarify → plan → tasks → analyze → implement.
18. Một task = một mục tiêu = một commit. Chỉ sửa file được liệt kê trong task.
19. Không refactor ngoài phạm vi task. Không thêm thư viện mới nếu chưa được duyệt trong `plan.md`.
20. Không "đoán" API: tra tài liệu chính thức (Chrome Extensions docs, MDN WebExtensions). Nếu không chắc, ghi `TODO(verify)` và hỏi.
21. Xong task = test xanh + lint xanh + build thành công + tiêu chí nghiệm thu của task thỏa.

## V. Phạm vi
22. Giai đoạn: **P1 MVP** → **P2 Cosmetic & cập nhật** → **P3 Security** → **P4 Tiện ích người dùng** → **P5 YouTube** → **P6 Tuỳ chọn mở rộng** → **P7 Hoàn thiện/Firefox/Phát hành**.
23. Không làm thứ gì ngoài giai đoạn hiện tại.

## VI. Module YouTube & các lớp can thiệp sâu
24. Module YouTube là **tính năng cô lập**: có công tắc riêng, lỗi ở đây không được ảnh hưởng phần lõi.
25. Mọi script can thiệp trang (MAIN world) phải **fail-open**: bọc try/catch, nếu có lỗi thì trả về dữ liệu gốc, không bao giờ làm hỏng trang/video.
26. Selector, tên trường, endpoint cần sửa nhanh phải là **dữ liệu** (JSON) cập nhật qua filter-updater, không phải code tải từ xa.
27. Script MAIN world không được gửi dữ liệu trang ra ngoài, không dùng `eval`/`new Function`.
28. Quyền rộng (`management`, `webNavigation`, `history`…) cấm dùng; nếu thật sự cần thì phải là `optional_permissions`, xin khi người dùng bật tính năng, kèm giải thích.
29. Tính năng đồng bộ chỉ đồng bộ cài đặt, tắt mặc định, không đồng bộ thống kê/log/lịch sử.
