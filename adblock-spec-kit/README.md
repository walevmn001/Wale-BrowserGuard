# AdBlock Security Extension — Bộ Spec Kit cho Trae AI

Quy trình kiểu GitHub Spec Kit: **Spec → Plan → Tasks → Implement**, mỗi bước có "cổng duyệt".

## Tài liệu

- [Chính sách riêng tư](docs/privacy-policy.md) — không thu thập dữ liệu, chỉ lưu cục bộ.
- [Mô tả store](docs/store-listing.md) — nội dung niêm yết Chrome Web Store (vi/en) + lý do từng quyền.
- [Cân nhắc port Firefox](docs/firefox-port.md) — khác biệt MV3 Firefox vs Chromium và kế hoạch port (hoãn cho v1).

## Cấu trúc
```
.specify/memory/constitution.md      ← Luật bất biến (đưa vào context MỌI prompt)
specs/001-adblock-security/
  spec.md        ← LÀM GÌ (yêu cầu + tiêu chí nghiệm thu)
  clarify.md     ← Câu hỏi cần chốt trước khi plan
  plan.md        ← LÀM BẰNG CÁCH NÀO (kiến trúc, thư mục)
  algorithm.md   ← Thuật toán chặn / ưu tiên rule / cosmetic / bảo mật
  tasks.md       ← Task nhỏ, có thứ tự, có test
  analyze.md     ← Checklist đối chiếu spec ↔ plan ↔ tasks
  test-golden.md ← Bộ test vàng đo độ ổn định
prompts/                              ← Prompt dán vào Trae: START-HERE rồi 00 → 08
.trae/rules/project_rules.md          ← Rules Trae tự nạp (kiểm tra đúng đường dẫn theo phiên bản Trae của bạn)
```

## Cách dùng với Trae
1. Mở thư mục này làm project trong Trae.
2. Dán lần lượt prompt trong `prompts/` (00 → 08). Mỗi prompt chỉ làm đúng 1 việc.
3. Sau mỗi bước: đọc file Trae tạo ra, sửa tay nếu cần, rồi mới sang bước sau.
4. Giai đoạn implement: **1 task = 1 prompt = 1 commit**. Test xanh mới sang task tiếp.
5. Nếu Trae sinh code lệch: đưa lại `constitution.md` + task hiện tại, yêu cầu "chỉ sửa file liệt kê".

## Nguyên tắc vàng
- Không có spec thì không code. Không có test thì không merge.
- Không để Trae "đoán" API: bắt đối chiếu tài liệu chính thức của Chrome/Firefox Extensions.
- Mỗi lần chỉ 1 giai đoạn (MVP → Cosmetic → Security → Polish).

## Dùng với GitHub + Trae
1. Push thư mục lên repo, clone về máy, mở bằng Trae.
2. Rules ở `.trae/rules/project_rules.md` sẽ được nạp tự động. Nếu Trae của bạn không nhận, mở phần Rules trong cài đặt và dán nội dung file vào.
3. Dán `prompts/START-HERE.md` một lần, sau đó duyệt từng bước.

## Chống mất dữ liệu / làm tiếp khi bị ngắt
- `.trae/rules/project_rules.md`: luật tự nạp mọi hội thoại (kiểm tra tên thư mục rules đúng với phiên bản Trae của bạn; nếu khác, chép nội dung vào mục Rules của project).
- `PROGRESS.md`: điểm dừng. Trae đọc đầu mỗi phiên, cập nhật trước mỗi commit.
- Quy tắc Git: xong **mỗi task xanh** → commit + push `main`; xong **mỗi giai đoạn** → tag `phase-<P>-done` và push.
- Code đang đỏ mà sắp hết phiên → đẩy lên nhánh `wip/<TID>`, không đẩy lên `main`.
- Phiên mới / sau lỗi server: dán `prompts/09-resume.md`.
- Lần đầu: dán `prompts/10-bootstrap-github.md` để nối repo.
