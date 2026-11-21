# Analyze — Đối chiếu trước khi implement (và sau mỗi giai đoạn)

Trae tự trả lời từng mục: PASS/FAIL + lý do. FAIL → sửa tài liệu trước, chưa code.

## 1. Phủ yêu cầu
- [ ] Mỗi User Story (US-1…US-7) có ≥ 1 task trong tasks.md?
- [ ] Mỗi AC có ≥ 1 test (unit/e2e/golden)?
- [ ] Task nào không truy ngược được về spec? (xoá hoặc bổ sung spec)

## 2. Nhất quán
- [ ] Mỗi quyền trong plan.md có lý do & có US cần nó?
- [ ] Hằng số priority trong algorithm.md khớp constants?
- [ ] Cấu trúc thư mục trong plan khớp file nhắc trong tasks?
- [ ] Thư viện dùng trong tasks đều có trong plan mục 6?

## 3. Constitution
- [ ] Có chỗ nào cần `eval` / tải code từ xa / telemetry? (phải KHÔNG)
- [ ] Service worker có state toàn cục? (phải KHÔNG)
- [ ] Task nào quá lớn (> 5 file hoặc > 1 mục tiêu)? → tách nhỏ.

## 4. Rủi ro
- [ ] Giới hạn DNR đã kiểm tra trong tài liệu hiện hành?
- [ ] Phần không hỗ trợ của cú pháp filter đã có chiến lược bỏ qua?
- [ ] Có kế hoạch cho trang bị vỡ (whitelist nhanh, báo lỗi)?

## 5. Sau mỗi giai đoạn
- [ ] Test vàng không tụt so với cơ sở
- [ ] Lint/build/test xanh
- [ ] Không có quyền thừa
- [ ] Đã cập nhật spec/plan nếu thực tế khác dự kiến
