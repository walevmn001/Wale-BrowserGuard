# Plan 001 — Kiến trúc kỹ thuật

> Mọi quyết định phải truy ngược về spec.md. Thư viện mới cần được duyệt ở mục 6.

## 1. Stack
TypeScript (strict) · Vite · Vitest · Playwright · ESLint + Prettier · npm/pnpm.
Popup/options: HTML + TypeScript thuần hoặc Preact (nhẹ). Không dùng framework nặng.

## 2. Cấu trúc thư mục
```
src/
  background/
    service-worker.ts         # điểm vào, đăng ký listener
    ruleset-manager.ts        # bật/tắt ruleset tĩnh, quản lý rule động
    whitelist.ts              # whitelist -> allowAllRequests (dynamic rule)
    stats.ts                  # đếm request đã chặn
    filter-updater.ts         # cập nhật list theo lịch (alarms)
    security/
      malware-guard.ts
      privacy-settings.ts     # WebRTC policy...
  content/
    cosmetic.ts               # ẩn phần tử quảng cáo
    cosmetic-observer.ts      # MutationObserver, throttle
    anti-fingerprint.ts       # opt-in, MAIN world
  popup/  (index.html, popup.ts)
  options/ (index.html, options.ts)
  warning/ (warning.html, warning.ts)
  shared/ (storage.ts, messages.ts, types.ts, constants.ts, i18n.ts, logger.ts)
rules/
  static/ (ads.json, trackers.json, malware.json, privacy.json)
  cosmetic/ (generic.json, domain-specific.json)
scripts/
  build-rules.ts
  validate-rules.ts
tests/ (unit/, e2e/, golden/)
manifest.config.ts
```

## 3. Quyền & lý do
| Quyền | Lý do | Giai đoạn |
|-------|-------|-----------|
| declarativeNetRequest | Chặn/redirect request | P1 |
| declarativeNetRequestFeedback | Đếm request bị chặn (TODO(verify): giới hạn của quyền này; nếu không phù hợp thì dùng cách đếm thay thế) | P1 |
| storage | Cài đặt, whitelist, thống kê | P1 |
| alarms | Lịch cập nhật list | P2 |
| scripting | Chèn CSS cosmetic động | P2 |
| privacy | Chính sách WebRTC | P3 (optional) |
| host_permissions `<all_urls>` | Cần để rule áp dụng mọi trang; nêu rõ trong mô tả store | P1 |

## 4. Luồng dữ liệu
- **Build time**: filter list → `build-rules.ts` → DNR JSON (chia nhóm) + cosmetic JSON → đóng gói.
- **Chặn mạng runtime**: trình duyệt tự áp DNR (không qua JS) → nhanh, ổn định.
- **Whitelist**: bật whitelist domain → thêm dynamic rule `allowAllRequests` ưu tiên cao.
- **Cosmetic**: content script lấy selector theo domain → chèn `<style>` → observer xử lý phần tử động.
- **Cập nhật list**: alarm → tải → validate (schema, giới hạn, checksum) → swap; lỗi thì giữ bản cũ.

## 5. Giới hạn & rủi ro (PHẢI kiểm tra tài liệu hiện hành)
- Giới hạn số rule tĩnh/động/regex và số ruleset bật đồng thời của DNR → `validate-rules.ts` kiểm tra, ưu tiên nhóm rule hiệu quả nhất.
- Service worker bị tắt bất kỳ lúc nào → state ở storage.
- DNR không hỗ trợ mọi cú pháp ABP (một số scriptlet, một số modifier) → liệt kê phần không hỗ trợ, bỏ qua có kiểm soát.
- Chống fingerprint dễ làm vỡ trang → mặc định tắt, có whitelist.

## 6. Thư viện được duyệt
- Dev: typescript, vite, vitest, playwright, eslint, prettier, **@types/chrome** (type-only, đã duyệt để dùng API `chrome.*` với TS strict), **@types/node** (type-only, đã duyệt để dùng `node:path`/`node:url`/`process` trong `playwright.config.ts` và script build với TS strict).
- Runtime: (không có, trừ khi duyệt thêm tại đây).
- Công cụ chuyển đổi filter: **tự viết converter tối giản** trong `scripts/build-rules.ts` (clarify #4). Không thêm dependency runtime hay dev. Hỗ trợ tập con cú pháp ABP cần cho P1 (domain/url/regex cơ bản, `@@` exception, `$` options phổ biến: `third-party`, `script`, `image`, `xmlhttprequest`, `~` negation, `|`/`||`/`^`); phần không hỗ trợ bỏ có kiểm soát và ghi vào báo cáo build.
- Giấy phép: code MIT; dữ liệu rule theo giấy phép từng nguồn (ghi ở `rules/README.md`).
- **Nguồn dữ liệu rule (rules/source/)**: `ads.txt`, `trackers.txt`, `malware.txt`, `cosmetic.txt` đều **tự soạn cho dự án, giấy phép MIT** (không chép danh sách của trang test bên thứ ba — loại giấy phép NC-SA). `trackers.txt` mở rộng ở **B2** với nhóm Social/Ad-pixel/Error-tracking (Facebook/Meta, TikTok, Pinterest, Twitter/X, Reddit, Sentry, LuckyOrange, Yahoo analytics, Taboola, Outbrain). Danh sách chỉ dạng domain/path-anchored để không vỡ trang.

## 7. Chiến lược test
- Unit: ruleset-manager, whitelist, stats, parser/validator, filter-updater (mock fetch).
- E2E (Playwright, nạp extension thật): theo test-golden.md.
- Hiệu năng: đo thời gian điều hướng có/không extension.

---
## Phụ lục — Kiến trúc cho chức năng mở rộng

### Thư mục bổ sung
```
src/background/
  site-pause.ts            # H: tắt 1 click có hạn
  protection-levels.ts     # I: mức Nhẹ/Chuẩn/Mạnh
  export-import.ts         # L
  bug-report.ts            # L
  top-trackers.ts          # R
  ext-scan.ts              # S (P6, optional permission)
  settings-sync.ts         # T (P6)
src/content/
  picker.ts                # J (activeTab + scripting)
  annoyances.ts            # K
  phishing-guard.ts        # M
  http-form-guard.ts       # N
  popup-guard.ts           # P (MAIN world, mức Mạnh)
  youtube/
    prune-main.ts          # Q2 (MAIN world)
    cosmetic.ts            # Q3
    ad-skip.ts             # Q4
    health.ts              # Q5
rules/static/ (thêm) cryptomining.json, youtube.json
rules/cosmetic/ (thêm) annoyances.json, youtube.json
data/ brands.json, psl-min.json, youtube-config.json
templates/ ci.yml          # mẫu GitHub Actions (T005 đưa vào .github/workflows/)
```

### Quyền bổ sung
| Quyền | Lý do | GĐ |
|-------|-------|----|
| activeTab | Element picker, chỉ khi người dùng bấm | P4 |
| commands (khai báo manifest) | Phím tắt | P4 |
| optional: management | Quét extension, xin khi dùng | P6 |
| storage.sync (dùng quyền storage) | Đồng bộ cài đặt, tắt mặc định | P6 |
| host_permissions youtube.com | Đã nằm trong `<all_urls>`; script MAIN world khai báo trong content_scripts | P5 |

### Ghi chú rủi ro
- Module YouTube: dễ hỏng khi YouTube đổi; phải cô lập, fail-open, cập nhật bằng dữ liệu (Constitution VI).
- Script MAIN world cần kiểm tra chính sách Chrome Web Store hiện hành trước khi phát hành (TODO(verify)).
- Dữ liệu PSL/brands: ghi nguồn + giấy phép; kích thước nhỏ để không nặng extension.
- Cảnh báo giả mạo: ưu tiên ít báo sai; có đường "Tin tưởng trang này".
