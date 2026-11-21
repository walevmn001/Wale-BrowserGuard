# Prompt 07 — Sửa lỗi / trang bị vỡ

Bối cảnh: constitution + plan + algorithm.

Lỗi: {MÔ TẢ, URL trang, hiện tượng, bước tái hiện}.

Quy trình bắt buộc:
1. Tái hiện lỗi bằng một test thất bại (unit hoặc e2e) TRƯỚC.
2. Xác định nguyên nhân gốc (rule nào, selector nào, đoạn code nào). Giải thích ngắn.
3. Sửa tối thiểu. Không refactor lan rộng.
4. Test mới phải xanh; toàn bộ test cũ vẫn xanh; chạy lại test vàng, báo số liệu so với cơ sở.
5. Nếu là rule/selector gây vỡ: thêm ngoại lệ có chú thích lý do, không xoá cả nhóm rule.
