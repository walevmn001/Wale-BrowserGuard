# Cấu hình

Trạng thái: SPECIFIED.

Ba nhóm, mỗi nhóm một file trong `src/config/`:
- **Bảo mật** (`security.js`): domain được phép chặn, domain không bao giờ được chặn, quyền tối đa.
- **Hiệu năng** (`performance.js`): `MAX_DEPTH`, `MAX_NODES`, `MAX_RESPONSE_BYTES`, `TICK_MS`, `WATCHDOG_TICK_MS`, `OBSERVER_DEBOUNCE_MS`, `NAV_DEBOUNCE_MS`, `LOG_MAX_ENTRIES`.
- **Hành vi** (`behavior.js`): timeout state machine, `CONFIRM_TICKS`, `CLEAR_TICKS`, `CLICK_COOLDOWN_MS`, `STALL_THRESHOLD_MS`, `RECOVERY_*`, retry limit, ngưỡng vô hiệu hóa module.

Mỗi khóa ghi: tên, kiểu, mặc định, khoảng hợp lệ, mức xác minh (`UNVERIFIED` hoặc `MEASURED`), lý do.

Schema: `CONFIG_SCHEMA_VERSION` trong `schema.js`, khóa `configSchemaVersion` trong `chrome.storage.sync`.

## Cờ tính năng
- Tên cờ cố định, 12 cờ (xem `contracts/feature-flags.md` mục 2).
- Snapshot có `schemaVersion` = `FLAG_SCHEMA_VERSION`.
- Với ba cờ MAIN, giá trị mặc định có hiệu lực cho đến khi adapter gửi snapshot. Đây là giả định A-3, có hệ quả trên popup.
