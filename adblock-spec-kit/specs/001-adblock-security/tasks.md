# Tasks — Mỗi task = 1 prompt = 1 commit

Định dạng: ID · Mục tiêu · File · Test · Tiêu chí xong. Làm đúng thứ tự.

## Giai đoạn 0 — Khung dự án
- **T001** Khởi tạo project (Vite + TS strict + ESLint + Prettier + Vitest). Xong: `build`, `test`, `lint` chạy được.
- **T002** Manifest MV3 tối thiểu + service worker rỗng + popup rỗng. Xong: nạp được vào Chrome không lỗi.
- **T003** `shared/`: types, constants (priority), logger, storage wrapper có kiểu. Test: unit (mock chrome.storage).
- **T004** Cấu hình Playwright nạp extension; e2e "extension load được".
- **T005** CI: tạo `.github/workflows/ci.yml` từ `templates/ci.yml` (lint + test + build mỗi lần push/PR; e2e chạy bằng xvfb). Cần có `package-lock.json`. Xong: push lên GitHub thấy CI xanh.

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
- **T038** `phishing-guard.ts` + `data/brands.json` + `psl-min.json` (thuật toán M). Test: bộ ≥ 30 tên giả, ≥ 50 tên hợp lệ không bị báo (≤ 1% báo sai). Có "Tin tưởng trang này".
- **T039** `http-form-guard.ts` (thuật toán N). E2E: báo trên http giả lập, không báo trên https/localhost.
- **T040** `rules/static/cryptomining.json` + đăng ký ruleset (thuật toán O). E2E: script đào giả bị chặn.
- **T041** `popup-guard.ts` MAIN world, mức Mạnh (thuật toán P). E2E: chặn khi không có thao tác người dùng, cho phép khi có; fail-open.
- **T042** Chạy test vàng + checklist `analyze.md` mục 5 cho P3.

## Giai đoạn P4 — Tiện ích người dùng
- **T050** `site-pause.ts` (thuật toán H) + nút "Trang bị lỗi? Tắt 1 click" trong popup. Test: hết hạn tự bật lại, kể cả sau restart.
- **T051** `protection-levels.ts` (thuật toán I) + UI chọn mức, overrides theo nhóm. Test: đổi mức đúng ruleset/cờ; idempotent.
- **T052** Element picker `picker.ts` (thuật toán J, activeTab + scripting). Test: tạo selector ổn định, từ chối selector rộng, hoàn tác, giới hạn 200/domain.
- **T053** `annoyances.json` + `annoyances.ts` (thuật toán K). E2E: ẩn banner cookie, trang vẫn cuộn.
- **T054** `export-import.ts` (thuật toán L). Test: file hỏng/quá lớn bị từ chối; merge/replace nguyên tử.
- **T055** `bug-report.ts` báo lỗi cục bộ (thuật toán L). Test: file không chứa URL đầy đủ/thống kê; không có request mạng nào.
- **T056** Badge + phím tắt + top trackers (thuật toán R). Test: throttle badge; giới hạn 200 domain.
- **T057** Chế độ tối/sáng, hỗ trợ bàn phím cho popup/options.
- **T058** Chạy test vàng + checklist P4.

## Giai đoạn P5 — Module YouTube (best-effort, cô lập)
- **T060** `data/youtube-config.json` + schema + validator + cờ module trong settings (mặc định TẮT ở mức Chuẩn). Test: schema hợp lệ/không hợp lệ.
- **T061** Trang **mock YouTube** cho e2e: player response giả có `adPlacements/playerAds/adSlots`, DOM giả `.ad-showing`, nút bỏ qua. Xong: mock chạy được trong Playwright.
- **T062** Q1: ruleset `youtube.json` (endpoint ứng viên). Mỗi rule có test "video mock vẫn phát". Ghi TODO(verify) và kiểm tra tay trên trang thật.
- **T063** Q2: `prune-main.ts` (MAIN world, fail-open). Test trên mock: trường quảng cáo bị xoá, trường khác nguyên vẹn; lỗi → trả dữ liệu gốc.
- **T064** Q3: CSS ẩn khối quảng cáo YouTube (`rules/cosmetic/youtube.json`). E2E trên mock.
- **T065** Q4: `ad-skip.ts` (bỏ qua/tua + khôi phục, giới hạn 3 lần thử). Test: khôi phục tiếng/tốc độ/vị trí; không vòng lặp vô hạn.
- **T066** Q5: `health.ts` giám sát + tự hạ cấp theo phiên. Test: mô phỏng video lỗi → Q2 tắt → thông báo.
- **T067** Q6: cập nhật `youtube-config` qua filter-updater, kill-switch `enabled:false`. Test: cập nhật hợp lệ/hỏng.
- **T068** UI: công tắc module + cảnh báo rủi ro (AC-15.6) trong options/popup.
- **T069** Chạy bộ test YouTube thật (5–10 video), lưu số liệu cơ sở; kiểm chứng mọi TODO(verify). Xong: ghi kết quả vào `tests/golden/results/`.

## Giai đoạn P6 — Tuỳ chọn mở rộng (mặc định TẮT)
- **T080** `ext-scan.ts` (thuật toán S, optional permission `management`). Test: chấm điểm rủi ro; không tự tắt extension.
- **T081** `settings-sync.ts` (thuật toán T). Test: chỉ cài đặt được đồng bộ; xung đột theo updatedAt; vượt hạn mức → từ chối rõ ràng.
- **T082** Rà soát quyền & Constitution lần nữa (mục VI).

## Giai đoạn P7 — Hoàn thiện & phát hành
- **T090** Tối ưu hiệu năng (đo trước/sau, bao gồm script MAIN world).
- **T091** Tài liệu, chính sách riêng tư (nói rõ không thu thập, YouTube best-effort), LICENSE, CHANGELOG.
- **T092** Cân nhắc port Firefox (YouTube dễ hơn nhờ API chặn mạnh hơn).
- **T093** Đóng gói release, kiểm tra chính sách Chrome Web Store (TODO(verify) về script MAIN world).

---
## Ghi chú đối chiếu số hiệu (đổi số)
Bốn task "Hoàn thiện & phát hành" trước đây đánh số **T040–T043** (giai đoạn "P4 — Hoàn thiện" cũ, đã xong) nay đổi số thành **T090–T093** (giai đoạn **P7**) để nhường dải T038–T042 cho các task bảo mật bổ sung ở P3:

| Số cũ (P4 cũ) | Nội dung | Số mới (P7) |
|---------------|----------|-------------|
| T040 | Tối ưu hiệu năng | **T090** |
| T041 | Tài liệu/chính sách/LICENSE/CHANGELOG | **T091** |
| T042 | Cân nhắc port Firefox | **T092** |
| T043 | Đóng gói release | **T093** |

Các task đã hoàn thành khác (T001–T004, T010–T018, T020–T025, T030–T037) và các mốc phát hành B0–B5 **giữ nguyên**; chi tiết nhật ký xem `docs/history.md`.
