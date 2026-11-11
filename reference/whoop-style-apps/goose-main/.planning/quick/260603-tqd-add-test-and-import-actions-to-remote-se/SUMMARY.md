---
phase: quick
plan: 260603-tqd
status: complete
completed: 2026-06-09
---

# Add Test and Import Actions to Remote Server — Complete

All must-haves delivered:

- "Test Connection" row: hits /healthz then /v1/devices (auth-gated), shows ✅/⚠️/❌ inline — ✅
- "Import do servidor" row: fetches and imports raw frames via capture.import_frame_batch — ✅
- Progress state and completion counts shown inline — ✅
- Both run on background task, never block @MainActor — ✅
- connectionTestRunning, connectionTestResult, serverImportInProgress, serverImportLastFrameCount published on GooseAppModel — ✅

Tested in simulator 2026-06-09: "✅ Connected · 2 devices" confirmed.
