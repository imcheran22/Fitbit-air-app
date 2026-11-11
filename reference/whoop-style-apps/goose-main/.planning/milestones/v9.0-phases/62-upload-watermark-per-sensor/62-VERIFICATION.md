---
status: passed
phase: 62
score: 4/4
completed: 2026-06-11
---

# Phase 62 Verification: Upload Watermark per Sensor

## Goal
Track last successfully uploaded timestamp per data type so restarts never re-send data already in TimescaleDB.

## Criteria Results

### SC1 — Watermark persisted per type, updated atomically on success ✅
`GooseUploadWatermark.swift` defines `WatermarkType.rawFrames` and `.decodedStreams` with independent UserDefaults keys (`goose.swift.upload.rawFramesWatermark`, `goose.swift.upload.decodedStreamsWatermark`). Watermark is written only after confirmed HTTP 200 success, using max row timestamp (post CR-01 fix).

### SC2 — After crash, next launch resumes from watermark ✅
`GooseUploadService` reads `effectiveSince = GooseUploadWatermark.watermark(for:) ?? sinceTimestamp` before every upload. Crash-safe: if no watermark exists, falls back to `sinceTimestamp`. Server has `ON CONFLICT DO NOTHING` for deduplication.

### SC3 — Server deduplication in place ✅
Server `store.py:54` has `ON CONFLICT (device_id, captured_at, frame_hex) DO NOTHING`. No server changes needed; watermark reduces unnecessary re-uploads.

### SC4 — clearAllWatermarks reset path exists ✅
`GooseUploadWatermark.clearAllWatermarks()` removes both UserDefaults keys. `GooseAppModel.clearAllUploadWatermarks()` calls it and resets `lastUploadAt = nil`. Available for logout/device-swap flows.

## Code Review Fixes Applied
- CR-01: Watermark now uses max row timestamp, not `Date()` (prevents historical backfill gaps)
- CR-02: Watermark advancement only for WHOOP device uploads (not HR monitor)
- CR-03: `since_ts` passed to Rust `rows_pending_upload` (prevents limit=500 filling with old rows)
- WR-01: `markStreamsSynced` failures now log at `.warning` level

## Self-Check: PASSED
