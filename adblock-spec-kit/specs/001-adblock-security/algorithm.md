# Thuật toán cốt lõi

## A. Thứ tự ưu tiên quyết định cho một request
```
INPUT: request (url, initiator, resourceType)
1. Trang đang duyệt có trong whitelist người dùng?      → ALLOW (allowAllRequests)
2. Domain đích có trong danh sách malware/phishing?      → BLOCK (cao nhất sau whitelist)
3. Khớp rule ngoại lệ (@@) của filter list?              → ALLOW
4. Khớp rule chặn quảng cáo/tracker?                     → BLOCK
5. URL là http và có thể nâng cấp?                       → UPGRADE https (có ngoại lệ, tránh lặp)
6. URL chứa tham số theo dõi?                            → REDIRECT bỏ tham số
7. Còn lại                                               → ALLOW
```
Priority của DNR (số lớn thắng):
whitelist allowAllRequests = 1000 · malware block = 900 · exception allow = 800 · block = 500 · upgradeScheme = 300 · removeparam = 200.
Ghi hằng số vào `shared/constants.ts`, KHÔNG viết số cứng rải rác.

## B. Build rule (scripts/build-rules.ts)
```
1. Đọc filter list → parse từng dòng
2. Bỏ comment, dòng rỗng
3. Phân loại: network | cosmetic | không hỗ trợ
4. network → DNR (hoặc dùng thư viện converter)
5. Loại trùng, loại rule vô hiệu
6. Gán priority theo nhóm (bảng A)
7. Chia ruleset theo nhóm: ads / trackers / malware / privacy
8. Kiểm tra giới hạn; vượt → ưu tiên rule phổ biến, ghi báo cáo phần bị cắt
9. Xuất JSON + báo cáo (số rule, số bị bỏ, lý do)
10. Validate schema trước khi đóng gói
```

## C. Whitelist
```
toggle(domain, enabled):
  nếu tắt chặn cho domain:
     thêm dynamic rule { priority:1000, action:{type:"allowAllRequests"},
        condition:{ requestDomains:[domain], resourceTypes:["main_frame","sub_frame"] } }
  ngược lại: xoá rule đó
  lưu danh sách vào storage; id rule sinh ổn định từ hash(domain)
```
Phải **idempotent**: gọi nhiều lần cho cùng kết quả. Cập nhật dynamic rule bằng 1 lệnh `updateDynamicRules` (xoá + thêm cùng lúc) để tránh trạng thái nửa vời.

## D. Cosmetic filtering
```
onDocumentStart(domain):
  selectors = generic ∪ domainSpecific(domain) − exceptions(domain)
  chèn <style> "sel1, sel2, … { display:none !important }" (chia lô ≤ 500 selector)
observer:
  MutationObserver(subtree) → gom thay đổi bằng requestAnimationFrame / throttle 200ms
  → chỉ kiểm tra node mới thêm, không quét toàn trang
  → dừng quan sát sau 30s nếu trang yên; bật lại khi có mutation lớn
```
Ràng buộc: cấm selector quá rộng (`div`, `a`, `*`); selector lỗi → try/catch từng cái, bỏ qua.

## E. Cập nhật filter list (an toàn)
```
onAlarm("update-filters"):
  for each nguồn:
     tải (timeout 15s, giới hạn kích thước)
     validate: định dạng, kích thước, số rule, checksum nếu có
     hợp lệ → lưu vào storage khoá "pending"
  nếu tất cả OK: swap atomically "pending" → "active"; ghi version + thời gian
  nếu lỗi: giữ "active" cũ, log cục bộ, thử lại với backoff 1h → 6h → 24h
```

## F. Bảo vệ malware
```
main_frame bị rule malware → redirect sang warning.html?target=<url mã hoá>
warning.html: hiện domain + lý do; nút "Quay lại an toàn"; nút "Vẫn tiếp tục" (ngoại lệ tạm 10 phút cho domain)
```

## G. Riêng tư
- HTTPS: `upgradeScheme`; không nâng cấp localhost / IP nội bộ / domain trong danh sách ngoại lệ.
- Tham số theo dõi: danh sách cố định trong dữ liệu (utm_*, fbclid, gclid, mc_eid, …).
- Referer: TODO(verify) tài liệu hiện hành về header nào được phép sửa bằng `modifyHeaders`.
- WebRTC: `chrome.privacy.network.webRTCIPHandlingPolicy = "default_public_interface_only"` khi bật; khôi phục khi tắt.
- Anti-fingerprint: opt-in; giảm bề mặt cơ bản; có công tắc tắt nhanh theo trang.

---
# Thuật toán mở rộng (P3 → P6)

## H. Tắt 1 click có thời hạn (US-8)
```
pauseSite(domain, ttl):            # ttl ∈ {1h, 24h, forever}
  expiresAt = (ttl == forever) ? null : now + ttl
  storage.pauses[domain] = { expiresAt }
  addWhitelistRule(domain)         # thuật toán C, idempotent
  nếu expiresAt: chrome.alarms.create("pause:"+domain, { when: expiresAt })
  reload tab hiện tại
onAlarm("pause:<domain>"):  nếu pause đã hết hạn → xoá whitelist rule + xoá khỏi storage
onStartup / onInstalled:    quét storage.pauses, xoá mục đã hết hạn (alarm có thể mất khi restart)
```

## I. Mức bảo vệ (US-9)
| Nhóm | Nhẹ | Chuẩn (mặc định) | Mạnh |
|------|:---:|:----------------:|:----:|
| Quảng cáo mạng (ads) | ✔ | ✔ | ✔ |
| Malware/phishing domain | ✔ | ✔ | ✔ |
| Tracker (privacy list) | | ✔ | ✔ |
| Cosmetic + cookie banner | | ✔ | ✔ |
| Nâng cấp HTTPS + bỏ tham số theo dõi | | ✔ | ✔ |
| Cảnh báo giả mạo + form mật khẩu http | | ✔ | ✔ |
| Cryptojacking | ✔ | ✔ | ✔ |
| Referer giảm, WebRTC, popup/tab-under | | | ✔ |
| Anti-fingerprint, module YouTube | | | tuỳ chọn riêng |
```
applyLevel(level):
  cấu hình = bảng trên
  bật/tắt từng ruleset (updateEnabledRulesets) + ghi cờ tính năng vào storage.settings
  mỗi nhóm vẫn có thể bị người dùng ghi đè (storage.overrides) → overrides thắng level
  idempotent; chạy lại khi khởi động service worker nếu trạng thái ruleset lệch settings
```

## J. Element picker (US-10)
```
bắt đầu (từ popup, activeTab): chèn content/picker.ts → overlay highlight phần tử dưới con trỏ
onClick(el): chặn sự kiện mặc định
  candidates = []
  1. nếu el.id hợp lệ (không số ngẫu nhiên/hash dài) và duy nhất → "#id"
  2. thuộc tính ổn định (data-testid, aria-label, role, name) duy nhất → "tag[attr='v']"
  3. tổ hợp class: bỏ class "động" (chứa số dài, hash, trạng thái hover/active) → "tag.c1.c2"
  4. thêm tổ tiên gần nhất có id/class ổn định: "anc > tag.c1"
  chọn selector ngắn nhất có document.querySelectorAll(sel).length == 1 (tối đa cho phép 20 nếu người dùng chọn "ẩn tất cả giống thế")
  từ chối nếu: sel là html/body/chỉ tên thẻ, hoặc khớp > 20 phần tử, hoặc phần tử chiếm > 70% viewport (nghi ẩn cả trang)
preview: ẩn thử bằng <style> tạm; người dùng Xác nhận / Hoàn tác
lưu: storage.customSelectors[domain].push({selector, createdAt}); giới hạn 200 selector/domain
```
Selector lưu là dữ liệu; luôn escape/validate bằng `document.querySelector` trong try/catch trước khi áp.

## K. Cookie banner & popup phiền (US-11)
```
nguồn: rules/cosmetic/annoyances.json (generic + theo domain) → áp như thuật toán D
sau khi ẩn: nếu body/html có overflow:hidden hoặc class khoá cuộn được liệt kê (vd. "modal-open", "no-scroll")
            và ban đầu không phải do menu của trang đang mở → gỡ khoá (chỉ 1 lần, không lặp liên tục)
KHÔNG tự bấm "Từ chối/Chấp nhận" (rủi ro vỡ trang và vấn đề pháp lý đồng ý)
```

## L. Nhập/xuất cài đặt & báo lỗi cục bộ (US-12)
```
export(): { schema:1, appVersion, settings, whitelist, pauses(bỏ hết hạn), customSelectors } → file JSON
          KHÔNG gồm: thống kê, log, URL đã duyệt
import(file):
  kiểm tra kích thước ≤ 1MB, JSON hợp lệ, schema==1 (sai → từ chối)
  validate từng trường: domain hợp lệ, selector qua querySelector try/catch, số lượng ≤ giới hạn
  hỏi: Gộp (merge) hay Thay thế (replace); ghi nguyên tử; lỗi giữa chừng → không đổi gì
bugReport(): file JSON cục bộ: version, trình duyệt, mức bảo vệ, ruleset bật, cờ tính năng,
             domain trang hiện tại (chỉ khi người dùng đồng ý), 100 dòng log gần nhất đã bỏ query string
             → tải về máy; không gửi đi
```

## M. Cảnh báo tên miền giả mạo (US-14.1)
```
dữ liệu: brands.json [{ name, legitDomains:[…], keywords:[…] }], psl-min.json (public suffix rút gọn)
content script document_start (tất cả trang, rất nhẹ):
  d = registrableDomain(location.hostname)       # eTLD+1 dùng psl-min
  nếu d ∈ tập legitDomains → thoát
  n = normalize(d): chuyển punycode→unicode, map ký tự dễ nhầm (0→o, 1→l, rn→m, vv→w, cyrillic/greek→latin)
  for brand in brands:
     nếu levenshtein(label(n), label(brand.legit)) ≤ 1  (hoặc ≤ 2 nếu tên ≥ 8 ký tự)
        hoặc n chứa brand.keyword kèm từ nghi ngờ (login, secure, verify, account, support)
        → nghi ngờ
  mức độ: thấp (chỉ tên giống) | cao (+ có input[type=password] hoặc form đăng nhập)
  hành vi: mức cao → overlay toàn trang/redirect warning.html (Quay lại / Vẫn tiếp tục 10 phút); mức thấp → banner nhỏ
giảm báo sai: bỏ qua nhãn < 5 ký tự; người dùng bấm "Tin tưởng trang này" → whitelist domain
chạy hoàn toàn cục bộ, không gửi domain đi đâu
```

## N. Cảnh báo form mật khẩu trên http (US-14.2)
```
nếu location.protocol=="http:" và hostname không phải localhost/127.0.0.1/mạng nội bộ:
   nếu có input[type=password] (kiểm tra lúc load + MutationObserver có throttle, dừng sau 10s yên)
   → hiện banner "Trang không mã hoá, đừng nhập mật khẩu" (không chặn); mỗi trang chỉ báo 1 lần/phiên
```

## O. Cryptojacking (US-14.3)
```
rules/static/cryptomining.json: DNR block domain + đường dẫn script khai thác đã biết
ưu tiên = nhóm block (500); không có heuristic CPU để tránh báo sai
cập nhật qua filter-updater (thuật toán E)
```

## P. Popup / tab-under / redirect quảng cáo (US-14.4, mức Mạnh)
```
content script MAIN world, document_start, chỉ khi cờ bật và domain không whitelist:
  bọc window.open:
     nếu navigator.userActivation.isActive (có thao tác người dùng gần đây) và URL cùng site hoặc người dùng bấm link thật → cho phép
     ngược lại → chặn, trả về đối tượng giả an toàn, tăng bộ đếm "popup đã chặn"
  tab-under: phát hiện click rồi (window.open + location đổi trong ≤ 500ms) → chặn phần chuyển hướng trang hiện tại
  redirect ra domain quảng cáo: đã có DNR (block main_frame tới domain ads) 
fail-open: mọi lỗi → gọi hàm gốc. Có nút "Cho phép popup trang này" trong popup.
```

## Q. Module YouTube (US-15) — best-effort, 6 lớp
```
cấu hình (dữ liệu) data/youtube-config.json: { version, enabled, layers:{…}, adFields:[…], selectors:[…], endpoints:[…], skipSelectors:[…] }
  cập nhật bằng filter-updater (thuật toán E). Mọi giá trị TODO(verify) với trang thật.

Q1. Chặn mạng (DNR, ruleset "youtube", priority nhóm block)
    ứng viên endpoint quảng cáo/đo lường: /pagead/*, /api/stats/ads, /api/stats/atr, /pcs/activeview,
    /youtubei/v1/player/ad_break … (TODO(verify): từng endpoint có làm hỏng phát video không)
    TUYỆT ĐỐI KHÔNG chặn endpoint phát video chính (/youtubei/v1/player, luồng googlevideo thường).
    Mỗi rule thêm vào phải có test e2e "video vẫn phát".

Q2. Loại trường quảng cáo khỏi dữ liệu player (content script MAIN world, document_start, chỉ trên youtube.com)
    cờ layers.prune==true:
      a) window.ytInitialPlayerResponse: defineProperty setter → khi gán, gọi prune(obj) rồi lưu
      b) bọc JSON.parse và Response.prototype.json: nếu đối tượng kết quả có khoá thuộc adFields
         (vd. adPlacements, playerAds, adSlots — TODO(verify) tên hiện hành) → xoá các khoá đó
      prune(obj): chỉ xoá khoá có trong danh sách adFields, không đụng trường khác; sâu tối đa 6 cấp; giới hạn kích thước
      fail-open: try/catch bao toàn bộ; lỗi → trả nguyên đối tượng gốc; ghi 1 dòng log cục bộ
      chỉ bọc ở mức tối thiểu và khôi phục hàm gốc khi người dùng tắt module (reload)

Q3. Ẩn giao diện quảng cáo (CSS dữ liệu): các khối quảng cáo trong feed, banner đầu trang, overlay quảng cáo trên player
    (selector TODO(verify) — vd. .ytp-ad-module, ytd-ad-slot-renderer, #masthead-ad, ytd-display-ad-renderer)

Q4. Dự phòng khi quảng cáo vẫn phát (layers.skip==true)
    quan sát player bằng MutationObserver (throttle 200ms) tìm trạng thái "đang phát quảng cáo" (vd. class .ad-showing — TODO(verify)):
      nếu đang quảng cáo:
         1) bấm nút bỏ qua nếu có (skipSelectors)
         2) nếu không có: tắt tiếng + tăng tốc phát + tua tới cuối video quảng cáo (video.currentTime = duration - ε), chỉ khi duration hữu hạn
      khi quảng cáo kết thúc: KHÔI PHỤC tiếng + tốc độ + vị trí video chính
      giới hạn: mỗi quảng cáo tối đa 3 lần thử; không vòng lặp vô hạn; dừng quan sát khi rời trang xem

Q5. Giám sát sức khoẻ & tự hạ cấp (US-15.4)
    đo cục bộ: video đứng hình > 8s khi không có quảng cáo / sự kiện lỗi phát (onerror, trạng thái lỗi player)
    nếu lỗi xảy ra N=2 lần trong 5 phút sau khi bật Q2 → tắt Q2 cho phiên này, giữ Q1/Q3, hiện thông báo
    nếu vẫn lỗi → tắt toàn bộ module cho phiên này; người dùng có thể "Báo lỗi" (thuật toán L)
    cờ hạ cấp lưu trong storage.session (hết phiên là reset), không tự bật lại giữa phiên

Q6. Cập nhật & kill-switch bằng dữ liệu
    youtube-config.version mới hơn → thay thế atomically (như thuật toán E)
    enabled:false trong cấu hình → tắt module cho tất cả người dùng sau lần cập nhật kế tiếp
    không tải code từ xa; chỉ tải JSON đã validate schema + kích thước

Kiểm thử: dùng trang giả lập (mock) có player response chứa adFields để test Q2/Q4 xác định được;
          chạy thủ công trên 5–10 video thật cho test vàng YouTube (ghi số liệu, không assert tuyệt đối vì YouTube đổi liên tục).
```

## R. Biểu tượng số, phím tắt, thống kê tracker (US-13)
```
badge: chrome.action.setBadgeText({tabId, text}) khi số chặn của tab đổi; throttle ≤ 1 lần/giây; xoá khi điều hướng
shortcut: manifest.commands "toggle-site" (gợi ý Alt+Shift+B) → toggle whitelist domain tab hiện tại
topTrackers: đếm theo domain bị chặn: Map<domain,count>, giữ top 200 (loại ít nhất khi vượt), lưu storage.local mỗi 30s hoặc khi đóng popup
theme: CSS prefers-color-scheme + công tắc thủ công lưu trong settings
```

## S. Quét extension (P6, tuỳ chọn)
```
cần optional permission "management": xin khi người dùng bấm "Quét extension"
for ext in chrome.management.getAll() (chỉ loại extension, bỏ chính mình):
   điểm rủi ro = trọng số(quyền): <all_urls>/host rộng, webRequest, cookies, history, tabs, nativeMessaging, debugger
                 + (không từ store: installType == development/sideload) + (không bật update URL của store)
   hiển thị danh sách sắp xếp theo điểm, kèm giải thích từng quyền
   KHÔNG tự tắt/gỡ; chỉ liên kết tới trang quản lý extension của trình duyệt
```

## T. Đồng bộ cài đặt (P6, tuỳ chọn, tắt mặc định)
```
bật: hiển thị thông báo "Cài đặt sẽ đồng bộ qua tài khoản trình duyệt của bạn"
đồng bộ: settings + whitelist + customSelectors (nén gọn), TUYỆT ĐỐI không stats/log/lịch sử
giới hạn dung lượng của chrome.storage.sync (TODO(verify) hạn mức hiện hành): vượt thì chia khoá hoặc từ chối kèm thông báo
xung đột: so sánh updatedAt từng nhóm; mới hơn thắng; ghi nguyên tử; lỗi → giữ bản cục bộ
```
