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
- Dev: typescript, vite, vitest, playwright, eslint, prettier, **@types/chrome** (type-only, đã duyệt để dùng API `chrome.*` với TS strict).
- Runtime: (không có, trừ khi duyệt thêm tại đây).
- Công cụ chuyển đổi filter: **tự viết converter tối giản** trong `scripts/build-rules.ts` (clarify #4). Không thêm dependency runtime hay dev. Hỗ trợ tập con cú pháp ABP cần cho P1 (domain/url/regex cơ bản, `@@` exception, `$` options phổ biến: `third-party`, `script`, `image`, `xmlhttprequest`, `~` negation, `|`/`||`/`^`); phần không hỗ trợ bỏ có kiểm soát và ghi vào báo cáo build.
- Giấy phép: code MIT; dữ liệu rule theo giấy phép từng nguồn (ghi ở `rules/README.md`).

## 7. Chiến lược test
- Unit: ruleset-manager, whitelist, stats, parser/validator, filter-updater (mock fetch).
- E2E (Playwright, nạp extension thật): theo test-golden.md.
- Hiệu năng: đo thời gian điều hướng có/không extension.
