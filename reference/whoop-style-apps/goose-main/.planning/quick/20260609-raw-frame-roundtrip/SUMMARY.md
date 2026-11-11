---
phase: quick
plan: 20260609-raw-frame-roundtrip
status: complete
completed: 2026-06-09
---

# Raw BLE Frame Storage Round-Trip — Complete

All 6 tasks completed:

1. Server raw_frames table in init.sql — ✅ (deployed on server)
2. Server insert_raw_frames_batch in store.py — ✅
3. Server /v1/ingest-frames and /v1/export/frames endpoints — ✅ (2550 frames stored)
4. Server deploy and smoke-test — ✅ (curl verified)
5. iOS uploadRawFrames in GooseUploadService.swift — ✅
6. iOS importHistoricalDataFromServer with trust-chain import UI button — ✅ (2026-06-09, 2550 frames imported)
