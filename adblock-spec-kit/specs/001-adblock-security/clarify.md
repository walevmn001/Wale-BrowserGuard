# Clarify — Chốt các điểm mơ hồ trước khi lập plan

Điền cột "Quyết định". Trae KHÔNG được sang bước plan khi còn dòng trống.

| # | Câu hỏi | Gợi ý mặc định | Quyết định |
|---|---------|----------------|------------|
| 1 | Trình duyệt mục tiêu v1? | Chromium (Chrome/Edge/Brave) | Chromium (Chrome/Edge/Brave). Firefox để P4. |
| 2 | Tên & ngôn ngữ giao diện? | Vi + En | Vi + En (i18n ở T017). |
| 3 | Nguồn filter list? | EasyList, EasyPrivacy, danh sách malware domain (vd. URLhaus) | EasyList (ads) + EasyPrivacy (trackers) + URLhaus (malware domains). |
| 4 | Tự viết bộ chuyển ABP→DNR hay dùng thư viện? | Dùng thư viện có sẵn (vd. converter của AdGuard), kiểm tra giấy phép | **Tự viết converter tối giản** trong `scripts/build-rules.ts` (không thêm dependency). Chỉ hỗ trợ tập con cú pháp ABP cần cho P1; phần không hỗ trợ bị bỏ có kiểm soát + ghi báo cáo. |
| 5 | Giấy phép dự án? | Tuỳ giấy phép của filter list (MIT/GPL) | Code phát hành MIT. Dữ liệu rule kèm giấy phép riêng theo từng nguồn (ghi trong `rules/README`), không trộn vào giấy phép code. |
| 6 | Whitelist theo domain hay URL? | Domain | Domain. |
| 7 | Cho người dùng tự thêm rule? | Có, ở P2, giới hạn số lượng | Có, ở P2, giới hạn ≤ 200 rule người dùng. |
| 8 | Cập nhật list: tải trực tiếp hay qua máy chủ riêng? | Tải trực tiếp, có kiểm tra | Tải trực tiếp, có validate + checksum/phiên bản (thuật toán E). |
| 9 | Chống fingerprint mức nào? | Cơ bản, opt-in | Cơ bản, opt-in, mặc định TẮT. |
| 10 | Trang cảnh báo có nút "Vẫn tiếp tục"? | Có | Có (ngoại lệ tạm 10 phút cho domain). |
| 11 | Thống kê chi tiết đến mức nào? | Theo trang + tổng | Theo trang + tổng. |
| 12 | Phát hành lên Chrome Web Store? | Sau P3 | Sau P3. |
