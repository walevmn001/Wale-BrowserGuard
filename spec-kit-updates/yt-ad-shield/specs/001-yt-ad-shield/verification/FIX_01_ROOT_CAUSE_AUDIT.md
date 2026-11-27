# FIX-01 — Audit và nguyên nhân gốc (Phase A)

> **Ngày:** 2026-11-27 · **Nhánh làm việc:** `trae/agent-scTM9F` · **Phạm vi:** engine YT Ad Shield trong WALE GUARD.

Tài liệu này ghi lại kết quả **Phase A — Audit hiện trạng** trước khi sửa mã. Mọi kết luận dưới đây
đều có căn cứ từ mã nguồn tại thời điểm audit.

## 1. Sáu vấn đề báo cáo

| # | Hiện tượng |
|---|-----------|
| 1 | Player JSON Pruner luôn hiển thị `WAITING_FOR_ADAPTER`. |
| 2 | Fetch Hook luôn hiển thị `WAITING_FOR_ADAPTER`. |
| 3 | XHR Hook luôn hiển thị `WAITING_FOR_ADAPTER`. |
| 4 | Mở video YouTube vẫn thấy quảng cáo. |
| 5 | Popup có thể báo `READY` dù adapter/hook chưa thực sự hoạt động. |
| 6 | Feature flags có thể không được áp dụng đúng thứ tự khi MAIN engine khởi động. |

## 2. A1 — Module activation

- **Mặc định `youtubeModule`:** `false` (OFF). Người dùng phải tự bật trong popup. **Giữ nguyên OFF mặc định** (đúng lựa chọn người dùng), không đổi thành ON.
- **Luồng bật/tắt:** `src/background/service-worker.ts` → `applyYouTubeEngineRegistration()` → `syncEngineRegistration(api, enabled)` (`src/youtube/isolated/registration.ts`).
- **Điều kiện đăng ký:** công tắc module `createYouTubeModuleSettings().isEnabled()` **VÀ** effective config (`loadEffectiveYouTubeConfig()?.enabled`).
- **Trạng thái sau cài mới / cập nhật / restart / reload tab:** `persistAcrossSessions: true` giữ đăng ký qua restart; công tắc OFF gỡ cả hai script (không cần reload).

**Kết luận A1:** luồng bật/tắt đúng; không có sai lệch cần sửa ở tầng activation. Vấn đề ba công tắc `WAITING` **không** nằm ở đây.

## 3. A2 — Registration

- `syncEngineRegistration` đăng ký/gỡ **cả hai** id (`ENGINE_SCRIPT_ID`, `BRIDGE_SCRIPT_ID`), gộp trong `ENGINE_SCRIPT_IDS`; idempotent qua `getRegisteredContentScripts({ ids })`.
- **Lỗ hổng phát hiện:** `isEngineRegistered()` (phiên bản cũ) chỉ kiểm script **MAIN**. Khi một script đăng ký thất bại (partial registration), popup vẫn coi engine là "registered".
- **Unregister:** gỡ đúng hai id của module, không ảnh hưởng module khác.

**Kết luận A2:** có lỗ hổng **partial registration không được hội tụ** và `isEngineRegistered` chỉ kiểm một nửa. → Sửa ở Phase C.

## 4. A3 — DatasetAdapter (Popup → Storage → ISOLATED → `data-wg-yt-flags` → MAIN)

- **Tên/kiểu cờ:** 12 cờ trong `FLAG_NAMES`; ba cờ MAIN `ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK`, `ENABLE_XHR_HOOK`. Snapshot: `{ schemaVersion, flags, source, receivedAt }` (schemaVersion `FLAG_SCHEMA_VERSION`).
- **Snapshot chưa tồn tại:** MAIN giữ mặc định A-3 (tất cả BẬT); `FeatureFlags.applyRemote` là **all-or-nothing** (snapshot sai → giữ nguyên giá trị cũ).
- **MutationObserver:** ISOLATED publish; MAIN đọc lần đầu trong `start()` + theo dõi thay đổi attribute.
- **MAIN không truy cập `chrome.*`:** đúng — không có `chrome.` trong `src/youtube/main/*`.
- **Không ghi đè cấu hình người dùng bằng mặc định:** đúng — snapshot chỉ *giảm* bảo vệ theo lựa chọn rõ ràng.

### 4.1 Lỗ hổng chính (nguyên nhân #1, #2, #3, #5, #6)

`src/youtube/main/main.ts` (phiên bản cũ) gọi `registry.initAll(ctx)` **TRƯỚC** khi `bootAdapter()` nhận và áp snapshot:

```
registry.initAll(ctx)      // (1) module init với mặc định A-3 — TRƯỚC snapshot
...
bootAdapter()              // (2) dataset adapter mới đọc snapshot
  adapter.onReceive → flags.applyRemote(raw)
```

Hệ quả:
- JSON Pruner đọc cờ **một lần** lúc `init` và không bao giờ xem lại → OFF runtime vẫn prune.
- Fetch/XHR **chỉ đăng ký** khi cờ đang BẬT lúc boot:
  ```
  if (flags.get('ENABLE_FETCH_HOOK')) registry.register(createFetchModule(...));
  if (flags.get('ENABLE_XHR_HOOK'))   registry.register(createXhrModule(...));
  ```
  Nếu cờ OFF lúc boot (hoặc snapshot đến muộn), module **không bao giờ** được đăng ký → hook không bao giờ cài.
- Không có **handshake MAIN → ISOLATED** báo trạng thái hook thật, nên popup không có nguồn trạng thái runtime.

## 5. Nguyên nhân gốc (root cause)

| Vấn đề | Nguyên nhân gốc |
|--------|-----------------|
| #6 Thứ tự flags sai | `registry.initAll()` chạy trước `bootAdapter()` → module init trên mặc định A-3 trước khi biết cấu hình người dùng. |
| #1,#2,#3 `WAITING` | Không có kênh MAIN → ISOLATED báo trạng thái hook; popup không có nguồn "đã cài & xác nhận" nào ngoài registration. |
| #4 Quảng cáo vẫn hiện | Hook chưa *thực sự* cài trong nhiều trường hợp (fetch/xhr không đăng ký khi cờ OFF lúc boot; pruner không reconcile), nên response player không bị prune. Đây là **giả thuyết có căn cứ từ mã**; mức độ "thấy quảng cáo" cụ thể **chưa xác minh trên Chrome thật** và phụ thuộc cả selector/endpoint (vẫn UNVERIFIED). |
| #5 `READY` giả | Popup dùng **duy nhất** `isEngineRegistered()` để kết luận -> set adapter/`snapshot` thành READY/AVAILABLE, dù hook chưa hề hoạt động. |

**Phạm vi ảnh hưởng:** `src/youtube/main/main.ts`, `src/youtube/main/player-response-hook.ts`, `src/popup/{popup,yt-layers}.ts`, `src/youtube/isolated/registration.ts`, `src/youtube/state/*`, `src/youtube/config/tuning.ts`, `src/youtube/main/{fetch,xhr}-interceptor.ts`, `src/shared/messages.ts`. Không chạm module chặn quảng cáo ngoài YouTube.

## 6. Ràng buộc phải giữ (đã kiểm)

- Giữ kiến trúc MV3, không viết lại extension, không tạo extension YouTube riêng.
- Không đưa module YouTube v1 (đã retire) trở lại production.
- Không chạy song song hai engine.
- Giữ API/contract hiện có; mặc định module **OFF**.
