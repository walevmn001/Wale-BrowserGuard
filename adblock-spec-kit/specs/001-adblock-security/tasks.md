# Tasks — Mỗi task = 1 prompt = 1 commit

Định dạng: ID · Mục tiêu · File · Test · Tiêu chí xong. Làm đúng thứ tự.

## Giai đoạn 0 — Khung dự án
- **T001** Khởi tạo project (Vite + TS strict + ESLint + Prettier + Vitest). Xong: `build`, `test`, `lint` chạy được.
- **T002** Manifest MV3 tối thiểu + service worker rỗng + popup rỗng. Xong: nạp được vào Chrome không lỗi.
- **T003** `shared/`: types, constants (priority), logger, storage wrapper có kiểu. Test: unit (mock chrome.storage).
- **T004** Cấu hình Playwright nạp extension; e2e "extension load được".

## Giai đoạn P1 — MVP chặn mạng
- **T010** `build-rules.ts`: parse filter → DNR JSON (ads, trackers). Test: unit 20 dòng mẫu (chặn, exception, không hỗ trợ).
- **T011** `validate-rules.ts`: schema + giới hạn + báo cáo. Xong: build fail nếu vượt giới hạn.
- **T012** Khai báo static rulesets + bộ rule nhỏ (~1k). E2E: script quảng cáo giả bị chặn.
- **T013** `ruleset-manager.ts`: công tắc tổng. Test: unit + e2e (tắt → không chặn).
- **T014** `whitelist.ts` (thuật toán C). Test: idempotent + e2e; còn sau restart.
- **T015** `stats.ts` đếm chặn (theo tab + tổng). Test: unit; số đúng trong e2e.
- **T016** Popup: bật/tắt trang, thống kê, tắt toàn bộ. Xong: AC-2.x, AC-3.x.
- **T017** i18n vi/en cho popup.
- **T018** Chạy **test vàng** lần đầu, lưu số liệu cơ sở. Xong: AC-1.1 → AC-1.4 đo được và đạt.

## Giai đoạn P2 — Cosmetic & cập nhật
- **T020** build-rules xuất cosmetic JSON. Test: unit.
- **T021** `cosmetic.ts` chèn CSS (thuật toán D, chưa observer). E2E: ẩn banner tĩnh.
- **T022** `cosmetic-observer.ts` throttle + dừng khi yên. E2E: quảng cáo chèn trễ + đo CPU.
- **T023** `filter-updater.ts` (thuật toán E). Test: mock fetch (OK, lỗi mạng, file hỏng, quá lớn). Xong: lỗi không mất rule cũ.
- **T024** Trang options: bật/tắt nhóm list, cập nhật thủ công, xem phiên bản.
- **T025** Chạy lại test vàng; không được tụt so với cơ sở.

## Giai đoạn P3 — Bảo mật
- **T030** Ruleset malware + redirect warning page (thuật toán F). E2E với domain giả lập.
- **T031** Warning page: quay lại / vẫn tiếp tục (ngoại lệ tạm).
- **T032** Nâng cấp HTTPS + ngoại lệ. E2E: không lặp vô hạn.
- **T033** Bỏ tham số theo dõi. Test: unit danh sách + e2e.
- **T034** Referer policy (TODO(verify)). E2E kiểm header.
- **T035** `privacy-settings.ts` WebRTC opt-in, khôi phục khi tắt.
- **T036** `anti-fingerprint.ts` opt-in + công tắc theo trang. Xác nhận mặc định TẮT; test vàng không tụt.
- **T037** Rà soát quyền & Constitution (không quyền thừa, không `eval`…).

## Giai đoạn P4 — Hoàn thiện
- **T040** Tối ưu hiệu năng (đo trước/sau).
- **T041** Tài liệu, chính sách riêng tư, mô tả store.
- **T042** Cân nhắc port Firefox.
- **T043** Đóng gói release.

## Giai đoạn UI — Giao diện mới (trắng + xanh mint) — chạy được độc lập với P5/P6
Nguồn: `specs/001-adblock-security/ui-ux.md` §7 + nguyên mẫu trong `ui/`. Làm MỖI LẦN MỘT TASK theo `prompts/12-ui-ux.md` (giữ nguyên hành vi, chỉ đổi trình bày).
- **T070** Đưa `design-tokens.css`, `components.css`, `icon.svg` vào `src/shared/ui/`; cấu hình build copy; xuất icon PNG 16/32/48/128 (công cụ sinh PNG dev-only phải được duyệt ở plan §6, hoặc xuất thủ công). Xong: manifest có icon, trang nạp được CSS.
- **T071** Làm lại **popup** theo `ui/popup.html` (giữ nguyên logic đã có; nối công tắc/mức/tắt tạm/ẩn phần tử với module sẵn có). Không inline script. E2E: các thao tác chính vẫn chạy.
- **T072** Làm lại **options** theo `ui/options.html` (điều hướng, thẻ mức bảo vệ, bộ lọc, whitelist, YouTube, nhập/xuất).
- **T073** Làm lại **warning page** theo `ui/warning.html`; nút hoạt động đúng thuật toán F.
- **T074** Giao diện **picker + banner cảnh báo** bằng Shadow DOM. E2E trên trang có CSS xung đột: không bị ảnh hưởng.
- **T075** i18n đầy đủ vi/en cho mọi chuỗi UI; kiểm tra chuỗi dài không vỡ.
- **T076** Chế độ tối/sáng + hoàn thiện truy cập (tương phản, bàn phím, giảm chuyển động).
- **T077** Kiểm thử: e2e mọi trang render không lỗi console; ảnh chụp chuẩn (Playwright `toHaveScreenshot`) cho popup/options/warning ở sáng + tối.
