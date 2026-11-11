---
phase: 91-threading-algorithm-comments
plan: 01
status: complete
completed_at: "2026-06-18"
---

# Summary: Threading Comments — Swift Files

## What Was Done

Added `// THREADING:` comments to four Swift files per COMM-02.

**GooseRustBridge.swift** (3 comments):
- Class declaration: FFI blocking contract, multiple-instance pattern, @unchecked Sendable rationale
- `private let lock = NSLock()`: lock scope — guards counter + _lastTiming across concurrent callers
- `func requestValue`: caller responsibility to dispatch to background queue before calling

**CaptureFrameWriteQueue.swift** (2 comments):
- Class declaration: @unchecked Sendable safe — stateLock + serial writeQueue
- `private let stateLock = NSLock()`: guards pendingRows, queuedRowCount, isWriting, completion callbacks between BLE ingest and writeQueue flush

**OvernightSQLiteMirrorQueue.swift** (1 comment):
- Class declaration: @unchecked Sendable safe — serial queue provides mutual exclusion without NSLock; Rust bridge accessed only from within that queue

**GooseAppModel.swift** (2 comments):
- Class declaration (`@MainActor @Observable`): bridge methods block thread — never call from @MainActor
- `notificationIngestQueue` declaration: three-stage BLE→parse→write pipeline threading model

## Verification

- `grep -c "THREADING:"`: 3 / 2 / 1 / 2 across the four files ✓
- `xcodebuild build -sdk iphonesimulator`: **BUILD SUCCEEDED** ✓
- No logic or whitespace changes — comment additions only ✓
