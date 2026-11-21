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
