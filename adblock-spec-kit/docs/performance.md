# Hiệu năng — đo & ngân sách (T090)

Ghi lại cách đo và số liệu "trước/sau" cho P7. Ngân sách lấy từ Constitution 15:
độ trễ điều hướng thêm **< 5ms (trung vị)** và bộ nhớ extension **< 100MB** với bộ
rule mặc định.

## 1. Đo lõi (mạng + cosmetic) — `tests/golden/`

Bộ test vàng ([golden.spec.ts](file:///workspace/adblock-spec-kit/tests/golden/golden.spec.ts))
chạy 40 trang tổng hợp offline, mỗi trang đo có/không extension (5 mẫu/trang, lấy
mẫu nhanh nhất để khử nhiễu CPU), đọc heap service worker qua CDP và lưu
`tests/golden/results/<ngày>.json`.

| Chỉ số | Trước (commit `2026-11-21`) | Sau (lần chạy T090) | Ngưỡng | Đạt |
| --- | --- | --- | --- | --- |
| Tỉ lệ chặn (AC-1.1) | 173/173 = 100% | 173/173 = 100% | ≥ 95% | ✔ |
| Tỉ lệ vỡ trang (AC-1.2) | 0/40 = 0% | 0/40 = 0% | ≤ 2% | ✔ |
| Trễ điều hướng (AC-1.3) | +4.5ms | +4.8ms | < 5ms | ✔ |
| Heap service worker | 1.235MB | 0.829MB | < 100MB | ✔ |
| Chặn nhầm host benign (B2b-3) | 0/36 | 0/36 | = 0 | ✔ |
| Còn chặn sau restart (AC-1.4) | đạt | đạt | đạt | ✔ |

AC-1.3 là chỉ số duy nhất nhạy nhiễu (dưới tải `nproc=2` có thể phải chạy lại;
xem [PROGRESS.md](file:///workspace/adblock-spec-kit/PROGRESS.md)). Lần chạy đầy đủ
gần nhất: **5/5 xanh**.

## 2. Đo script MAIN world — `tests/e2e/perf-mainworld.spec.ts`

Các script can thiệp trang chạy ở **MAIN world** (anti-fingerprint P3; Q2 prune và
Q4 ad-skip của module YouTube P5). Chúng được `chrome.scripting.executeScript`
tuần tự hoá bằng `Function.prototype.toString()`, nên chi phí cần đo là **thời
gian chạy trên trang**. Spec nạp hàm đã tuần tự hoá vào một trang sạch rồi bấm giờ
(ngân sách đặt rộng để chỉ bắt lỗi phình to, không bắt nhiễu):

| Script | Cài đặt | Một lượt chạy | Ngân sách |
| --- | --- | --- | --- |
| Q2 prune (`prune-main.ts`) | 0.20ms | 0.20ms (payload ~7 tầng, đủ `adFields`) | 20ms / 50ms |
| Q4 ad-skip (`ad-skip.ts`) | 0.10ms | — (observer, throttle 200ms) | 20ms |
| anti-fingerprint (`anti-fingerprint.ts`) | 3.50ms | — | 20ms |

Chi phí bị chặn bởi thiết kế, không chỉ bởi đo:

- **Q2 prune** chỉ *xoá* các khoá thuộc `adFields`, sâu ≤ 6, ngân sách
  `YOUTUBE_PRUNE_LIMITS.maxKeys = 100_000` khoá/lượt; idempotent (cờ
  `__adblockYtPrune`) nên không cộng dồn qua các lần điều hướng.
- **Q4 ad-skip** dùng `MutationObserver` **throttle 200ms** và tối đa **3 lần
  thử/quảng cáo** (không vòng lặp vô hạn).
- **anti-fingerprint** chạy **một lần/trang** (cờ `__adblockAntiFingerprint`),
  mặc định TẮT (opt-in), chỉ gán vài thuộc tính `navigator`/WebGL.
- Module YouTube nói chung mặc định TẮT (AC-15.1), nên trên người dùng chưa bật
  thì các script MAIN world **không chạy** — chi phí bằng 0.

Mọi script đều **fail-open** (`try/catch`): lỗi thì trả dữ liệu gốc, không bao giờ
làm chậm/hỏng trang (Constitution VI).

## 3. Chạy lại

```
npm run build
xvfb-run -a npx playwright test --config playwright.golden.config.ts   # lõi
xvfb-run -a npx playwright test tests/e2e/perf-mainworld.spec.ts        # MAIN world
```

## 4. Còn lại — TODO(verify)

Số liệu trên là **offline** (trang tổng hợp + mock). Đo trên **trang thật** (đặc
biệt là YouTube thật khi module bật) là việc chạy tay, lặp lại theo cùng lệnh ở
mục 3 khi có thiết bị; ghi kết quả vào `tests/golden/results/`. Việc này gắn với
checklist T069 ([youtube-verification.md](file:///workspace/adblock-spec-kit/docs/youtube-verification.md)).
