# Cấu hình

Trạng thái: **IMPLEMENTED / TESTED** cho lớp cấu hình của engine mới (Phase 1–6). Các ngưỡng số vẫn **UNVERIFIED** trên Chrome thật.

## Đã triển khai (Phase 1)

Vị trí: `adblock-spec-kit/src/youtube/config/`.

### `flags.ts` — Feature Flag Interface (world-independent)

- `FLAG_SCHEMA_VERSION = 1`.
- `FLAG_NAMES`: đúng **12 cờ** (xem dưới). Khớp `contracts/feature-flags.md` mục 2.
- `DEFAULT_FLAGS`: tất cả **bật**. Áp dụng giả định A-3 (khi chưa có snapshot, cờ MAIN hiệu lực là bật).
- `class FeatureFlags`: `get` / `applyRemote` / `snapshot` / `subscribe` / `dispose`. `applyRemote` **all-or-nothing**: từ chối toàn bộ nếu sai `schemaVersion`, thiếu/thừa khóa, hoặc sai kiểu; giữ giá trị cũ. Cờ lạ không gây lỗi (trả `false`, ghi cảnh báo một lần).
- **Không phụ thuộc world**: không chạm `window`/`document`/`chrome` (kiểm bằng `tests/unit/youtube/architecture.test.ts`).

| # | Cờ | Nơi thực thi | Phụ thuộc adapter (T004) |
|---|-----|--------------|--------------------------|
| 1 | `ENABLE_JSON_PRUNER` | MAIN | Có |
| 2 | `ENABLE_FETCH_HOOK` | MAIN | Có |
| 3 | `ENABLE_XHR_HOOK` | MAIN | Có |
| 4 | `ENABLE_DNR` | ISOLATED | Không |
| 5 | `ENABLE_RUNTIME_GUARD` | ISOLATED | Không |
| 6 | `ENABLE_PLAYBACK_WATCHDOG` | MAIN/ISOLATED | Phase 4 |
| 7 | `ENABLE_RECOVERY` | MAIN | Phase 4 |
| 8 | `ENABLE_CSS_HIDER` | ISOLATED | Phase 5 |
| 9 | `ENABLE_AD_STATE_MACHINE` | MAIN | Không |
| 10 | `ENABLE_SPA_NAVIGATION` | MAIN | Phase 5 |
| 11 | `ENABLE_DOM_OBSERVER` | MAIN | Phase 5 |
| 12 | `ENABLE_DEBUG_LOGGER` | cả hai | Không |

### `tuning.ts` — ngưỡng số tập trung

`TUNING` + `TUNING_VERSION`. Mọi giá trị là **đề xuất, chưa đo** (UNVERIFIED).

| Khóa | Giá trị | Ý nghĩa |
|------|---------|---------|
| `pruneMaxDepth` | 6 | Độ sâu đệ quy tối đa của JSON pruner |
| `pruneMaxKeys` | 100000 | Số khóa tối đa duyệt trước khi bỏ (overBudget) |
| `fetchInterceptTimeoutMs` | 2000 | Timeout đọc/ghi lại response fetch |
| `xhrInterceptTimeoutMs` | 2000 | Timeout xử lý XHR |
| `adDetectThrottleMs` | 200 | Giãn cách phát hiện quảng cáo |
| `skipMaxAttempts` | 3 | Số lần thử skip tối đa mỗi quảng cáo |
| `recoveryCooldownMs` | 5000 | Cooldown giữa các lần recovery |
| `recoveryMaxRetries` | 2 | Số lần recovery tối đa |
| `watchdogPollMs` | 1000 | Chu kỳ poll của watchdog (Phase 4) |
| `stallMs` | 8000 | Ngưỡng coi là đứng hình (Phase 4) |
| `audioRestoreTimeoutMs` | 1000 | Timeout khôi phục âm thanh |

## Khung đặc tả (giữ nguyên, chưa triển khai)

Ba nhóm theo đặc tả, mỗi nhóm một file trong `src/config/`:
- **Bảo mật** (`security.js`): domain được phép chặn, domain không bao giờ được chặn, quyền tối đa.
- **Hiệu năng** (`performance.js`): `MAX_DEPTH`, `MAX_NODES`, `MAX_RESPONSE_BYTES`, `TICK_MS`, `WATCHDOG_TICK_MS`, `OBSERVER_DEBOUNCE_MS`, `NAV_DEBOUNCE_MS`, `LOG_MAX_ENTRIES`.
- **Hành vi** (`behavior.js`): timeout state machine, `CONFIRM_TICKS`, `CLEAR_TICKS`, `CLICK_COOLDOWN_MS`, `STALL_THRESHOLD_MS`, `RECOVERY_*`, retry limit, ngưỡng vô hiệu hóa module.

Schema: `CONFIG_SCHEMA_VERSION` trong `schema.js`, khóa `configSchemaVersion` trong `chrome.storage.sync`.

## Cờ tính năng (đặc tả)

- Tên cờ cố định, 12 cờ (xem `contracts/feature-flags.md` mục 2).
- Snapshot có `schemaVersion` = `FLAG_SCHEMA_VERSION`.
- Với ba cờ MAIN, giá trị mặc định có hiệu lực cho đến khi adapter gửi snapshot. Đây là giả định A-3, có hệ quả trên popup.

## Popup (Phase 6)

- Popup chỉ hiển thị **6 layer người dùng** qua `config/layers.ts`: `MAIN_LAYERS` (`ENABLE_JSON_PRUNER`, `ENABLE_FETCH_HOOK`, `ENABLE_XHR_HOOK`) và `ISOLATED_LAYERS` (`ENABLE_DNR`, `ENABLE_RUNTIME_GUARD`, `ENABLE_CSS_HIDER`). Các cờ còn lại không có công tắc riêng ở popup.
- Lựa chọn layer lưu trong `chrome.storage.sync` dưới khóa `youtubeEngineFlags` (`isolated/settings.ts`). Giá trị thiếu/hỏng → quay về mặc định A-3 (bật).
- Nhóm MAIN đi qua `state/toggle-state.ts` (`resolveDisplay`); khi chưa có adapter (NullAdapter) → `WAITING_FOR_ADAPTER`, popup **không** hiển thị "đã tắt"/"thành công". Thông điệp bắt buộc ở `state/messages.ts`, có guard cụm từ cấm.
