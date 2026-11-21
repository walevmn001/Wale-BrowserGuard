# B0 — Chẩn đoán nền v1 (chỉ đọc)

> Trạng thái: BẢN NHÁP CHỜ DUYỆT. Không sửa code. Số liệu lấy từ file thật trong repo
> + kết quả `npm run build`.

## 0. Cảnh báo bối cảnh còn thiếu (chặn các bước sau)

Prompt 14 yêu cầu bối cảnh bắt buộc, nhưng các file này **đã bị xoá** ở lượt "clean repo"
trước đó (commit `75511b4`), hiện không còn trong cây làm việc:

| File bắt buộc | Trạng thái |
| --- | --- |
| `.trae/rules/project_rules.md` | MISSING |
| `.specify/memory/constitution.md` | MISSING |
| `PROGRESS.md` | MISSING |
| `specs/001-adblock-security/tasks.md` | MISSING |
| `specs/001-adblock-security/algorithm.md` | MISSING |
| `specs/001-adblock-security/plan.md` | MISSING |

Hệ quả trực tiếp:
- Mục B0.4 (hạn mức Chrome) và B0.6 (dẫn `algorithm.md` §B/§D) không thể dẫn chiếu tài liệu
  nội bộ như yêu cầu; báo cáo dùng chính code làm nguồn.
- Luật 5 ("mỗi task = 1 commit + cập nhật `PROGRESS.md` + push main") và B2 ("ghi tên +
  giấy phép vào `plan.md` §6") **không thực hiện được** vì `PROGRESS.md`/`plan.md` không tồn tại.
- Cần bạn quyết định: tạo lại `PROGRESS.md` + `plan.md` (bản rút gọn) trước khi sang B1, hay
  bỏ yêu cầu ghi các file đó.

Phần chẩn đoán dưới đây vẫn hoàn thành được vì chỉ dựa trên code + build thật.

## 1. Các ruleset đang ship

Nguồn: [static-rulesets.ts](file:///workspace/adblock-spec-kit/scripts/static-rulesets.ts), manifest build
[dist/manifest.json](file:///workspace/adblock-spec-kit/dist/manifest.json), đếm rule từ `dist/rules/static/*.json`.

| id | Nguồn | enabled (manifest) | Số rule thực tế |
| --- | --- | --- | --- |
| `ads` | `rules/source/ads.txt` | `true` | 59 |
| `trackers` | `rules/source/trackers.txt` | `true` | 42 |
| `malware` | `rules/source/malware.txt` | `true` | 22 |
| `privacy` | sinh trong code [privacy-rules.ts](file:///workspace/adblock-spec-kit/scripts/privacy-rules.ts) | `true` | 2 |
| | | **Tổng** | **125** |

Cả 4 ruleset đều bật mặc định. Build in ra: `rulesets: 125 rules emitted, 33 lines skipped`.

## 2. Báo cáo converter

Bộ chuyển đổi: [build-rules.ts](file:///workspace/adblock-spec-kit/scripts/build-rules.ts) (interface giữ nguyên
`convert(lines) → { rules, unsupported }`; thực tế hàm là
[convertFilterList](file:///workspace/adblock-spec-kit/scripts/build-rules.ts#L250-L271)).

Đầu vào mạng = chỉ `ads.txt` + `trackers.txt` + `malware.txt` (cosmetic đi đường riêng, xem §5).

| Chỉ số | ads | trackers | malware | Tổng |
| --- | --- | --- | --- | --- |
| Dòng vào (`split('\n')`, gồm dòng trống cuối) | 75 | 48 | 22 | 145 |
| Dòng sinh rule | 59 | 42 | 11 | 112 |
| Rule sinh ra | 59 | 42 | 22 | 123 |
| `skipped` | 16 | 6 | 11 | **33** |

(`malware` sinh 2 rule/dòng bare-domain → 11 dòng ra 22 rule, xem [malware-rules.ts](file:///workspace/adblock-spec-kit/scripts/malware-rules.ts#L59-L79).)

**5 lý do bỏ phổ biến nhất** (khớp `summarize()`, [build-rules.ts](file:///workspace/adblock-spec-kit/scripts/build-rules.ts#L283-L300)):

1. `comment` — **23** (ads 11, trackers 4, malware 8): dòng bắt đầu `!` hoặc `[...]`.
2. `empty` — **10** (ads 5, trackers 2, malware 3): dòng trống.
3. `cosmetic` — 0.
4. `unsupported-option` — 0.
5. `unsupported-syntax` — 0.

Kết luận mục 2: **không một dòng nào bị bỏ vì cú pháp/option**. Toàn bộ 33 dòng bỏ là
comment/dòng trống. Nghĩa là converter *không* đang chặn nhầm dữ liệu; độ phủ thấp là do
**danh sách nguồn quá nhỏ**, không phải converter ăn mất rule.

## 3. resourceTypes bị ghi cứng & dạng rule bị bỏ

Trong rule đã sinh:

- Rule dạng `||host^` (phần lớn ads/trackers/malware): **KHÔNG** đặt `resourceTypes`
  → áp cho mọi loại request (`script`, `image`, `xmlhttprequest`, `ping`, …).
  Xem nhánh mặc định [build-rules.ts](file:///workspace/adblock-spec-kit/scripts/build-rules.ts#L183-L206).
  ⇒ Lỗi (c) `ads.js`/`pagead.js` **không** do `resourceTypes` bị siết.
- ads.txt có 2 dòng `$script` → bị ghi cứng `resourceTypes:["script"]`
  (ads.txt dòng 70–71). Đây là resourceTypes cứng duy nhất ở nhóm ads.
- malware: rule redirect cố định `resourceTypes:["main_frame"]`; rule block dùng
  `excludedResourceTypes:["main_frame"]` ([malware-rules.ts](file:///workspace/adblock-spec-kit/scripts/malware-rules.ts#L66-L78)).
- privacy: strip-param đặt `resourceTypes` = 15 loại (gồm `main_frame`); upgradeScheme đặt
  `excludedResourceTypes:["main_frame","sub_frame"]` ([privacy-rules.ts](file:///workspace/adblock-spec-kit/scripts/privacy-rules.ts#L155-L176)).

Dạng rule **sẽ bị bỏ** nếu gặp (dù danh sách hiện tại chưa có):
- `unsupported-option`: option lạ ngoài `third-party|script|image|xmlhttprequest`
  ([build-rules.ts](file:///workspace/adblock-spec-kit/scripts/build-rules.ts#L139-L177)).
- `unsupported-syntax`: trộn include + exclude resourceType; address regex rỗng; chuỗi không
  phải ASCII in được (`/^[\x21-\x7e]+$/`, [build-rules.ts](file:///workspace/adblock-spec-kit/scripts/build-rules.ts#L78)).
- Cosmetic `#?#`/`~domain` bị bỏ ở [build-cosmetic.ts](file:///workspace/adblock-spec-kit/scripts/build-cosmetic.ts#L123-L139).

Wildcard `*`, `|`, `^` trong `urlFilter` được **sao chép nguyên văn** (DNR hiểu cùng nghĩa ABP)
nên hiện không bị bỏ; nhưng converter **không tự sinh** pattern theo tên file/đường dẫn.

## 4. Nguồn filter, danh sách chống theo dõi, cắt do hạn mức

- Nguồn: 3 danh sách **tự viết cho dự án** (`ads.txt` 55 host, `trackers.txt` 42 host,
  `malware.txt` 11 host), giấy phép MIT — [rules/README.md](file:///workspace/adblock-spec-kit/rules/README.md).
- Danh sách chống theo dõi (tracker/privacy chuẩn, ví dụ EasyPrivacy): **CHƯA CÓ**. `trackers.txt`
  chỉ là starter list "analytics/tracking domains" tự soạn, không phải danh sách privacy có giấy phép.
- Rule bị cắt vì giới hạn: **0** (125 rule ≪ ngân sách).
- Hạn mức (nội bộ, [validate-rules.ts](file:///workspace/adblock-spec-kit/scripts/validate-rules.ts#L53-L58)):
  `STATIC_RULE_BUDGET = 30_000` (= `GUARANTEED_MINIMUM_STATIC_RULES` của Chrome, phần bảo đảm thấp
  nhất), `MAX_REGEX_RULES = 1_000`, `MAX_RULESETS = 100`, `MAX_ENABLED_RULESETS = 50`.
  Nguồn đối chiếu: developer.chrome.com → `declarativeNetRequest`, mục **Rule limits**
  (đã fetch; trang xác nhận có mục "Rule limits" và API kiểm tra tại runtime
  `getAvailableStaticRuleCount()`).
  `TODO(verify)`: các **số cụ thể** của Chrome không trích được từ bản fetch (bảng thuộc tính bị
  lược); cần đối chiếu lại trang `#property-GUARANTEED_MINIMUM_STATIC_RULES` v.v. trước khi dẫn số.

## 5. Cosmetic — file build, manifest, đường lấy selector

- File selector **CÓ** được build vào `dist`: build in `cosmetic: 12 generic + 4 domain selectors
  (4 domains), 19 lines skipped`; output tại `dist/rules/cosmetic/generic.json` và
  `dist/rules/cosmetic/domain-specific.json` ([build-cosmetic.ts](file:///workspace/adblock-spec-kit/scripts/build-cosmetic.ts#L46-L52),
  emit ở [vite.config.ts](file:///workspace/adblock-spec-kit/vite.config.ts#L42-L45)).
- Manifest **KHÔNG có `content_scripts`** ([dist/manifest.json](file:///workspace/adblock-spec-kit/dist/manifest.json),
  và [manifest.config.ts](file:///workspace/adblock-spec-kit/manifest.config.ts) không khai báo trường này).
  ⇒ Không có content script tĩnh chạy ở `document_start`.
- Đăng ký động: service worker chèn ở `tabs.onUpdated` **chỉ khi `status === 'complete'`**
  ([service-worker.ts](file:///workspace/adblock-spec-kit/src/background/service-worker.ts#L276-L283)),
  qua [injectCosmetic](file:///workspace/adblock-spec-kit/src/background/service-worker.ts#L161-L186):
  `chrome.scripting.insertCSS` + `executeScript(installCosmeticObserver)`.
- Content script lấy selector: service worker nạp JSON qua `fetch(chrome.runtime.getURL(...))`
  ([service-worker.ts](file:///workspace/adblock-spec-kit/src/background/service-worker.ts#L149-L159));
  dữ liệu JSON hợp lệ (`isCosmeticData`) nên đường lấy selector **hoạt động**.

## 6. Kết luận nguyên nhân gốc cho (a)–(d)

- **(a) Social/Yahoo/Luckyorange/Sentry gần như không bị chặn** — Do **thiếu phủ danh sách**:
  không host nào của Facebook/TikTok/Pinterest/Twitter/Reddit (social), `luckyorange.com`,
  `sentry.io`/`*.sentry-cdn.com` có trong `trackers.txt`/`ads.txt`. Yahoo chỉ có đúng
  `||ads.yahoo.com^` (ads.txt dòng 18) nên các endpoint ad khác của Yahoo lọt. Không phải lỗi converter.
- **(b) Cosmetic static + dynamic FAIL** — Hai nguyên nhân:
  1. Không có `content_scripts`/đăng ký ở `document_start`; CSS chỉ được chèn sau khi trang
     `complete` ([service-worker.ts](file:///workspace/adblock-spec-kit/src/background/service-worker.ts#L276-L283)),
     tức ẩn trễ với cả phần tử tĩnh lẫn phần tử chèn sau.
  2. Độ phủ selector quá nhỏ: chỉ 12 generic + 4 domain, `cosmetic.txt` 35 dòng
     ([cosmetic.txt](file:///workspace/adblock-spec-kit/rules/source/cosmetic.txt)) — không phủ
     hết class/id quảng cáo phổ biến.
- **(c) `ads.js`, `pagead.js` vẫn tải** — **Thiếu rule theo tên file/đường dẫn chung**: chỉ có
  2 rule path cho đúng URL cụ thể (ads.txt dòng 70–71), không có pattern dạng `/ads.js`,
  `/pagead.js`. Converter hiện không tự suy rộng theo tên file.
- **(d) Thiếu danh sách chống theo dõi** — **Chưa có** danh sách privacy/tracker có giấy phép;
  chỉ có starter list tự viết `trackers.txt` ([rules/README.md](file:///workspace/adblock-spec-kit/rules/README.md#L16-L27)).

---

**DỪNG — chờ duyệt B0.** Sau khi bạn duyệt: (1) xử lý mâu thuẫn bối cảnh ở §0 (tạo lại
`PROGRESS.md`/`plan.md` hay không), rồi (2) lần lượt B1 → B5, mỗi task một commit.
