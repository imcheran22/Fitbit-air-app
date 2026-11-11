---
phase: 09-ble-stability-data-integrity
fixed_at: 2026-06-04T21:45:00Z
review_path: .planning/phases/09-ble-stability-data-integrity/09-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 5
skipped: 2
status: partial
---

# Phase 09: Code Review Fix Report

**Fixed at:** 2026-06-04T21:45:00Z
**Source review:** .planning/phases/09-ble-stability-data-integrity/09-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-04)
- Fixed: 5 (CR-01, CR-02, WR-01, WR-02, WR-04)
- Skipped: 2 (CR-03, WR-03)

## Fixed Issues

### CR-01: `@Published` reconnect state mutated off main thread

**Files modified:** `GooseSwift/GooseBLEClient+Commands.swift`
**Commit:** 9298f0b
**Applied fix:** Added `Thread.isMainThread` guard at the top of `updateReconnectState`. When called from `coreBluetoothQueue` (via `stopReconnect`, `retryReconnect`, or `scheduleNextReconnect`), it now redirects to `DispatchQueue.main.async { [weak self] in self?.updateReconnectState(value) }` and returns early. Mutations on the main thread proceed immediately as before.

---

### CR-02: `pendingCompletion` closure never cleared after `flushCompletion` fires

**Files modified:** `GooseSwift/CaptureFrameWriteQueue.swift`
**Commit:** d2e21e7
**Applied fix:** Added `pendingCompletion = nil` immediately after `pendingCompletionResult = nil` inside `flushCompletion()`. The stale strong reference to the caller's completion closure is now released as soon as the result is dispatched to main, preventing unintended retention until the next `recordCompletion` call.

---

### WR-01: `activeDeviceID` read on `writeQueue` with no synchronisation

**Files modified:** `GooseSwift/CaptureFrameWriteQueue.swift`
**Commit:** f15b479
**Applied fix:** Replaced the plain `var activeDeviceID: String?` with a `stateLock`-backed computed property backed by `private var _activeDeviceID: String?`. Both the getter and setter acquire `stateLock` via `withLock { }`, making cross-queue access safe and eliminating the Swift 6 strict-concurrency violation.

---

### WR-02: `debugMenuCharacteristic` not cleared on BT power-off and disconnect

**Files modified:** `GooseSwift/GooseBLEClient+CentralDelegate.swift`
**Commit:** 6300c56
**Applied fix:** Added `debugMenuCharacteristic = nil` in two places: (1) the power-off branch of `centralManagerDidUpdateState`, alongside the existing `activePeripheral = nil` and `commandCharacteristic = nil` clears; (2) the `didDisconnectPeripheral` handler, alongside the existing characteristic clears. This prevents stale `CBCharacteristic` references from a dead connection being reused on the next reconnect cycle.

---

### WR-04: `importTimingSummary` references non-existent `raw_hex_encode_us` field

**Files modified:** `GooseSwift/CaptureFrameWriteQueue.swift`
**Commit:** 02bac10
**Applied fix:** Removed the `rawHex \(milliseconds("raw_hex_encode_us"))ms` segment from the timing summary string. `CapturedFrameBatchTimingReport` in `Rust/core/src/capture_import.rs` has no such field, so the segment unconditionally displayed `0.0ms`. The diagnostic output now reflects only fields that exist in the Rust struct.

---

## Skipped Issues

### CR-03: `nonisolated(unsafe) var frameReassemblyBuffers` data-race risk

**File:** `GooseSwift/GooseAppModel.swift:180`
**Reason:** Pre-existing issue — not introduced in phase 09. The `nonisolated(unsafe)` annotation was added in commit `51ba0c7` ("fix(concurrency): resolve Swift 6 strict-concurrency errors"), which predates phase 09. Modifying this in the current phase would be out of scope and could affect unrelated concurrent-access patterns. Documented for future refactor (use `NSLock` guard or `@MainActor` enforcement on `gooseFrames` call sites).

---

### WR-03: Staggered `writeSensorStreamCommands` does not re-validate connection state

**File:** `GooseSwift/GooseBLEClient+Commands.swift:430-448`
**Reason:** Pre-existing issue — not introduced in phase 09. The staggered `DispatchQueue.main.asyncAfter` write loop without a `connectionState == "ready"` re-check was present in the initial MVP commit (`46f1638`). Fixing this is a valid improvement but falls outside the phase 09 changeset scope. The REVIEW.md fix suggestion (add `self.connectionState == "ready"` to the guard) should be applied in a dedicated improvement task.

---

_Fixed: 2026-06-04T21:45:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
