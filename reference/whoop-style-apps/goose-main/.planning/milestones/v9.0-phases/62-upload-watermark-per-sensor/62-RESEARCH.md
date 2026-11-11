# Phase 62: Upload Watermark per Sensor — Research

**Researched:** 2026-06-11
**Domain:** iOS upload pipeline / UserDefaults persistence / server-side deduplication
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — this is a pure infrastructure phase with all implementation choices at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion. Key constraints from ROADMAP:
- Watermark persisted per upload type (raw frames, daily metrics)
- Updated atomically on upload success
- After crash mid-upload, next launch resumes from watermark (no duplicate rows in TimescaleDB)
- Server-side POST /v1/ingest-frames rejects or deduplicates frames below committed watermark
- `clearAllWatermarks()` reset path for logout / device swap
- Match WHOOP shape: `watermarksByRevision: [Int: Date]` pattern — but simpler binary watermark (timestamp per type) is acceptable given Goose's upload model

Preferred storage: UserDefaults (same as bondingState, simple, no SQLite dependency for this metadata).
Preferred key namespace: `goose.swift.upload.*` (consistent with `goose.swift.ble.*`).

### Deferred Ideas (OUT OF SCOPE)
- Per-revision watermarks matching WHOOP's full `watermarksByRevision: [Int: Date]`
- RuntimeWaterMarkReporter (reporting watermark state to server analytics)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UPLOAD-WM-01 | Watermark persisted per upload type; updated atomically on success; crash-safe; reset path exists; server deduplicates | Upload flow analysis, UserDefaults pattern from GooseBLEBondingManager, server ON CONFLICT DO NOTHING already exists |
</phase_requirements>

---

## Summary

Phase 62 adds a per-type upload high-water-mark to `GooseUploadService` so that after a crash or restart, the next upload cycle begins from the last confirmed successful upload rather than a fixed lookback window. Currently, `triggerManualUpload` and `triggerUpload(for:deviceEvent:)` pass either `lastUploadAt ?? Date() - 24h` or `Date() - 30s` as `sinceTimestamp`. These are session-only values; they are not persisted across app restarts. A crash mid-upload means the next launch resets `sinceTimestamp` to `now - 24h`, potentially re-sending large amounts of data that is already in TimescaleDB. The server's `ON CONFLICT DO NOTHING` on `raw_frames` and upsert semantics on decoded streams prevent actual duplicate rows, but unnecessary re-uploads waste bandwidth and complicate the upload badge count.

The implementation has three surfaces: (1) a new `GooseUploadWatermarkStore` value type (or enum) that reads/writes two `Date?` keys in `UserDefaults` under the `goose.swift.upload.*` namespace, owned and called by `GooseUploadService`; (2) a `sinceTimestamp` gate in `performUpload` and `uploadRawFrames` that reads the persisted watermark instead of the caller-supplied fallback; (3) a `clearAllWatermarks()` static method that removes both keys (called on logout/device-swap from `GooseAppModel`). The server side already deduplicates via `ON CONFLICT DO NOTHING` on `(device_id, captured_at, frame_hex)` — no server changes are strictly required for correctness, though a `since` query parameter is a useful optimisation that can be added without breaking existing callers.

**Primary recommendation:** Implement `GooseUploadWatermarkStore` as a simple `enum` with `static let` key constants and four operations (`rawFrames`, `dailyMetrics`, `update(:for:)`, `clearAll()`). Call `update(.rawFrames, for: Date())` inside `GooseUploadService.uploadRawFrames` after a 2xx response. Call `update(.dailyMetrics, for: Date())` inside `performUpload` after `markStreamsSynced`. Gate `sinceTimestamp` in both callers on `watermark(for:) ?? fallback`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Watermark read/write | iOS App (GooseUploadService) | — | Upload state is app-owned; server is the recipient |
| Atomic update on success | iOS App (GooseUploadService) | — | Must happen only after confirmed 2xx; service owns the success branch |
| Crash-safe persistence | UserDefaults | — | UserDefaults survives app crashes; SQLite is for health data |
| Server deduplication | Server (TimescaleDB) | — | ON CONFLICT DO NOTHING is the authoritative idempotency layer |
| clearAllWatermarks | iOS App (GooseAppModel) | GooseUploadWatermarkStore | Model calls store.clearAll() on logout/device-swap |
| Debug visibility | iOS App (GooseAppModel @Published) | MoreDebugViews | Expose watermark dates as observable state |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Foundation (UserDefaults) | iOS 26.0 SDK | Watermark persistence | Already used for bondingState, lastHistorySyncAt, RemoteServerStorage keys |
| Foundation (URLSession) | iOS 26.0 SDK | HTTP upload | Existing upload stack; no new dependency |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| OSLog | iOS 26.0 SDK | Debug logging for watermark events | Already used in GooseUploadService |

**No new dependencies.** This phase is pure Swift + UserDefaults.

---

## Package Legitimacy Audit

> No external packages are introduced in this phase. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
GooseAppModel+Upload.swift
  triggerManualUpload()
  triggerUpload(for:deviceEvent:)
        │
        ▼
GooseUploadService.upload(deviceID:deviceType:sinceTimestamp:)
        │
        ▼
GooseUploadService.performUpload(...)
  1. READ  GooseUploadWatermarkStore.watermark(.dailyMetrics)
     → if nil, use caller sinceTimestamp
     → if present, use watermark (ignore caller)
  2. captureAllPendingRowIDs(since: resolvedTimestamp)
  3. fetch decoded streams from Rust bridge
  4. POST /v1/ingest-decoded
  5. on 2xx:
     a. markStreamsSynced(rowIDsByStream:)
     b. WRITE GooseUploadWatermarkStore.update(.dailyMetrics, for: Date())
     c. uploadRawFrames(deviceID:sinceTimestamp: resolvedTimestamp)
        i.  READ  GooseUploadWatermarkStore.watermark(.rawFrames)
        ii. GET raw frames from Rust bridge since resolvedRawWatermark
        iii. POST /v1/ingest-frames
        iv. on 2xx: WRITE GooseUploadWatermarkStore.update(.rawFrames, for: Date())

GooseAppModel  (logout / device swap)
  → GooseUploadWatermarkStore.clearAll()
```

### Recommended Project Structure

```
GooseSwift/
├── GooseUploadWatermarkStore.swift   # new — enum, static keys, 4 operations
├── GooseUploadService.swift          # modified — reads/writes watermark
├── GooseAppModel+Upload.swift        # modified — calls clearAllWatermarks on logout
└── RemoteServerPersistence.swift     # no change needed
```

### Pattern 1: UserDefaults Key Namespace (from GooseBLEBondingManager)

**What:** Static `let` string constants on the owning type; dot-namespaced reverse-DNS format.
**When to use:** Any persistent metadata that is not health data.
**Example (existing — `GooseBLEBondingManager.swift`):**

```swift
// Source: GooseSwift/GooseBLEBondingManager.swift lines 17-18
static let bondingStateKey = "goose.swift.ble.bondingState"
static let bondingDeviceIDKey = "goose.swift.ble.bondingDeviceID"
```

Apply the same pattern to the watermark store:

```swift
enum GooseUploadWatermarkStore {
  static let rawFramesKey    = "goose.swift.upload.watermark.rawFrames"
  static let dailyMetricsKey = "goose.swift.upload.watermark.dailyMetrics"

  enum UploadType {
    case rawFrames
    case dailyMetrics
  }

  static func watermark(for type: UploadType) -> Date? {
    let key = udKey(for: type)
    return UserDefaults.standard.object(forKey: key) as? Date
  }

  // Called only inside the uploadSucceeded == true branch — never on failure.
  static func update(_ type: UploadType, to date: Date) {
    UserDefaults.standard.set(date, forKey: udKey(for: type))
  }

  // Called on logout or device swap from GooseAppModel.
  static func clearAll() {
    UserDefaults.standard.removeObject(forKey: rawFramesKey)
    UserDefaults.standard.removeObject(forKey: dailyMetricsKey)
  }

  private static func udKey(for type: UploadType) -> String {
    switch type {
    case .rawFrames:    return rawFramesKey
    case .dailyMetrics: return dailyMetricsKey
    }
  }
}
```

[ASSUMED] — implementation sketch; planner will verify against project conventions.

### Pattern 2: Watermark Gate in GooseUploadService.performUpload

**What:** Replace the caller-supplied `sinceTimestamp` with the persisted watermark when available; fall back to caller value only when no watermark exists.
**When to use:** Every upload path that queries data with a time lower bound.

**Integration in `performUpload` (existing flow):**

```swift
// Source: GooseSwift/GooseUploadService.swift — modified lines ~70-170
private func performUpload(deviceID: UUID, deviceType: String, sinceTimestamp: Date) async {
  // Resolve effective lower bound: persisted watermark takes precedence over caller hint.
  let effectiveSince = GooseUploadWatermarkStore.watermark(for: .dailyMetrics) ?? sinceTimestamp

  // ... existing guard blocks (uploadEnabled, serverURL, token) ...

  let pendingRowIDs = captureAllPendingRowIDs(deviceID: deviceID, sinceTimestamp: effectiveSince)

  // ... fetch streams, POST /v1/ingest-decoded ...

  if uploadSucceeded {
    markStreamsSynced(rowIDsByStream: pendingRowIDs)
    // Commit watermark AFTER marking rows synced — atomic from the app's perspective.
    GooseUploadWatermarkStore.update(.dailyMetrics, to: Date())
    await uploadRawFrames(deviceID: deviceID, sinceTimestamp: effectiveSince)
    stateLock.withLock {
      _lastUploadTimestamp = Date()
      _lastSyncedCount = syncedCount
    }
  }
  // ...
}
```

**Integration in `uploadRawFrames`:**

```swift
private func uploadRawFrames(deviceID: UUID, sinceTimestamp: Date) async {
  // Raw frames watermark is independent — raw and decoded uploads can fail independently.
  let effectiveSince = GooseUploadWatermarkStore.watermark(for: .rawFrames) ?? sinceTimestamp

  // ... existing Rust bridge call with effectiveSince ... //

  // Advance watermark only on 2xx.
  guard let (data, response) = try? await session.data(for: request),
        let http = response as? HTTPURLResponse,
        (200..<300).contains(http.statusCode) else {
    logger.debug("uploadRawFrames: server error")
    return
  }
  // Persist raw-frames watermark AFTER confirmed success.
  GooseUploadWatermarkStore.update(.rawFrames, to: Date())
  // ... existing logging ...
}
```

[ASSUMED] — planner will verify exact placement.

### Pattern 3: clearAllWatermarks on Logout / Device Swap

**What:** Single call site in `GooseAppModel` (e.g. a `resetAllUploadState()` helper) that clears both watermarks. Analogous to removing bond state in `GooseBLEBondingManager`.
**When to use:** User signs out, pairs a new WHOOP device, or explicitly requests a data reset.

```swift
// GooseAppModel+Upload.swift — new helper
func clearAllUploadWatermarks() {
  GooseUploadWatermarkStore.clearAll()
  lastUploadAt = nil
}
```

### Anti-Patterns to Avoid

- **Writing watermark before HTTP response:** The entire value of a watermark is that it only advances on confirmed success. Writing before the 2xx response is equivalent to losing the at-least-once guarantee.
- **Sharing rawFrames and dailyMetrics watermarks:** The two upload paths can fail independently (decoded upload succeeds, raw frame upload times out). They must have separate watermark keys.
- **Calling UserDefaults from a background queue without synchronization:** `UserDefaults.standard` is thread-safe for reads and writes individually, but the read-then-write pattern in `performUpload` runs on a detached task. Because each operation is atomic and the watermark is only ever advanced (never decremented), the lack of a lock around the pair is safe — a concurrent write from a second upload batch would only advance the watermark further, which is correct.
- **Resetting watermark on non-2xx:** Leave the watermark unchanged on failure. The `markStreamsSynced` pattern in the existing code already follows this rule.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Server deduplication | Custom rejected-frames filter | `ON CONFLICT DO NOTHING` (already in `store.py:54`) | TimescaleDB uniqueness on `(device_id, captured_at, frame_hex)` is authoritative and already in production |
| Thread-safe timestamp | Custom atomic wrapper | `NSLock.withLock` (already pattern in GooseUploadService) | Existing pattern; watermark writes happen only in success branch, one at a time |
| Retry / idempotency | Custom frame de-dup cache | Server ON CONFLICT | Server already handles re-posts correctly |

**Key insight:** The server-side dedup layer (`ON CONFLICT DO NOTHING`) already provides idempotency. The iOS watermark's role is to reduce unnecessary re-uploads — not to prevent data corruption. This means a conservative (earlier) watermark is always safe; only an incorrectly advanced watermark would cause data loss.

---

## Common Pitfalls

### Pitfall 1: Watermark Written Before Confirmed 2xx

**What goes wrong:** If the app writes the watermark before the HTTP response is checked, a server timeout leaves the watermark advanced past data that was never actually persisted.
**Why it happens:** Confusion between "upload was initiated" and "upload succeeded."
**How to avoid:** The write must be inside the `uploadSucceeded == true` branch — after `markStreamsSynced` (decoded path) or after the `(200..<300).contains(http.statusCode)` guard (raw frames path).
**Warning signs:** TimescaleDB rows missing for a time window where the watermark has already advanced.

### Pitfall 2: sinceTimestamp Override Without Watermark Gate

**What goes wrong:** `triggerUpload(for:deviceEvent:)` passes `Date() - 30s` as `sinceTimestamp`. If the implementation ignores the persisted watermark and always uses the caller's value, the watermark is written but never used — a no-op.
**Why it happens:** The watermark gate must be applied inside `performUpload` / `uploadRawFrames`, not at the call site. Call sites pass a hint; the service resolves the effective lower bound.
**How to avoid:** Replace the top-of-function `sinceTimestamp` binding with `GooseUploadWatermarkStore.watermark(for:) ?? sinceTimestamp`.

### Pitfall 3: Same Watermark for Both Upload Types

**What goes wrong:** If decoded-stream upload succeeds but raw-frame upload fails (e.g. server timeout on a large batch), a shared watermark would advance past frames never confirmed by the server.
**Why it happens:** Treating the two uploads as one atomic unit when they are not.
**How to avoid:** Separate keys (`goose.swift.upload.watermark.rawFrames`, `goose.swift.upload.watermark.dailyMetrics`); each advanced only on its own 2xx response.

### Pitfall 4: clearAllWatermarks Not Called on Device Swap

**What goes wrong:** After pairing a new WHOOP device, the old watermark prevents uploading data captured before the swap. The upload silently skips historical frames because `effectiveSince > frameTimestamp`.
**Why it happens:** Watermarks are device-type-agnostic in Goose's current model (no per-device-UUID watermark). Swapping devices requires a full reset.
**How to avoid:** Call `clearAllUploadWatermarks()` whenever `GooseBLEBondingManager` transitions to `.notStarted` (bond cleared) or when the user explicitly re-pairs.

### Pitfall 5: UserDefaults `set(_:forKey:)` with `Date` vs Double

**What goes wrong:** Storing a `Date` directly with `UserDefaults.set(_:forKey:)` is valid (the plist serializer accepts `Date`). Reading it back requires `object(forKey:) as? Date` — not `double(forKey:)`. Using the wrong reader returns 0.0 or nil unexpectedly.
**Why it happens:** Inconsistency between the write type and the read cast.
**How to avoid:** Use `UserDefaults.standard.set(date, forKey:)` and read with `UserDefaults.standard.object(forKey:) as? Date`. Pattern is already established in `GooseAppModel+BandFirstSync.swift` line 19 (`object(forKey:) as? Date`).

---

## Code Examples

### Existing: lastHistorySyncAt — Direct Analog for Watermark Pattern

```swift
// Source: GooseSwift/GooseAppModel+BandFirstSync.swift lines 19-29 (VERIFIED by direct read)
if let lastSync = UserDefaults.standard.object(forKey: Self.lastHistorySyncAtKey) as? Date,
   Date().timeIntervalSince(lastSync) < Self.bandFirstSyncCooldown {
  // skip
}
// Write BEFORE the BLE call to prevent retry loops.
UserDefaults.standard.set(Date(), forKey: Self.lastHistorySyncAtKey)
```

The watermark pattern is the same except the write happens AFTER success, not before.

### Existing: GooseBLEBondingManager — Key Constant Pattern

```swift
// Source: GooseSwift/GooseBLEBondingManager.swift lines 17-18 (VERIFIED by direct read)
static let bondingStateKey  = "goose.swift.ble.bondingState"
static let bondingDeviceIDKey = "goose.swift.ble.bondingDeviceID"
```

### Existing: uploadRawFrames — Success Guard (insertion point for watermark write)

```swift
// Source: GooseSwift/GooseUploadService.swift lines 210-218 (VERIFIED by direct read)
guard let (data, response) = try? await session.data(for: request),
      let http = response as? HTTPURLResponse,
      (200..<300).contains(http.statusCode) else {
  logger.debug("uploadRawFrames: server error")
  return
}
// ← watermark write belongs here
```

### Existing: Server ON CONFLICT — Already Idempotent

```python
# Source: server/ingest/app/store.py lines 50-54 (VERIFIED by direct read)
"""INSERT INTO raw_frames
   (device_id, captured_at, frame_hex, source, device_type, device_model, sensitivity, device_uuid)
   VALUES (%s, to_timestamp(%s), %s, %s, %s, %s, %s, %s)
   ON CONFLICT (device_id, captured_at, frame_hex) DO NOTHING"""
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Session-only `lastUploadAt` (resets on restart) | Persisted `Date?` per upload type in UserDefaults | This phase | Crash-safe; no re-upload on restart |
| Caller-supplied `sinceTimestamp` (fixed lookback) | Watermark-gated effective lower bound | This phase | Minimal re-upload surface; server skips fewer rows via ON CONFLICT |

**WHOOP equivalent confirmed via Ghidra analysis:**
- `WHPStrapLatestUploadedMetricDateKey` — per-metric high-water timestamp
- `StoredWatermarksAtHistoryCompleteExecutor` — persists watermarks atomically when HISTORY_COMPLETE fires
- Goose's simplified model (two types, `Date?` per type) is deliberately simpler than WHOOP's `[Int: Date]` revision map; appropriate for Goose's append-only upload model.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GooseUploadWatermarkStore` implemented as `enum` with static methods | Architecture Patterns | Planner may prefer a struct or class; no correctness impact |
| A2 | Watermark write for dailyMetrics goes after `markStreamsSynced`, before `uploadRawFrames` call | Pattern 2 | If ordering is wrong, a raw-frames failure would leave dailyMetrics watermark too advanced; low risk since decoded and raw watermarks are independent |
| A3 | `clearAllWatermarks` is called on bond clear / device swap | Pitfall 4 | If not wired, old watermark blocks historical re-upload after device swap |
| A4 | No server-side watermark endpoint needed | Architecture | Server ON CONFLICT is sufficient; if server-side since-filtering is added later, it's additive |

---

## Open Questions

1. **Should the raw-frames watermark advance per-device or globally?**
   - What we know: current upload sends frames for one device per call; `deviceID` is a parameter.
   - What's unclear: if two WHOOP devices are paired in future, a global watermark would incorrectly gate device B using device A's timestamp.
   - Recommendation: Keep it global for now (matches CONTEXT.md's "simpler binary watermark"); add per-device keying as a follow-up if multi-device upload is needed.

2. **Should `clearAllWatermarks` also reset `lastHistorySyncAtKey` in BandFirstSync?**
   - What we know: `lastHistorySyncAtKey` is a BLE sync cooldown guard, not an upload watermark; semantically different.
   - What's unclear: on device swap, should the BLE sync cooldown also reset so the new device's history fetches immediately?
   - Recommendation: Out of scope for Phase 62; leave BLE sync cooldown untouched.

---

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. This phase adds no new tools, services, CLIs, or runtimes. All work is pure Swift + existing UserDefaults + server Python already deployed.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | No Swift test target detected in GooseSwift.xcodeproj |
| Config file | none |
| Quick run command | n/a (no XCTest target) |
| Full suite command | `cargo test` (Rust core only) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UPLOAD-WM-01a | Watermark persisted per type | manual-only | n/a — no Swift test target | ❌ |
| UPLOAD-WM-01b | Watermark read on next launch | manual-only | n/a | ❌ |
| UPLOAD-WM-01c | clearAllWatermarks removes both keys | manual-only | n/a | ❌ |
| UPLOAD-WM-01d | Server ON CONFLICT dedup | Server-level (existing test) | `pytest server/ingest/tests/test_ingest_frames_api.py` | ✅ |

**No Swift test target exists.** Verification for iOS behaviour must be done via simulator run + OSLog observation (as per project convention).

### Wave 0 Gaps
- [ ] `server/ingest/tests/test_ingest_frames_api.py` — verify existing dedup test covers re-post scenario (may already pass)

---

## Security Domain

### Applicable ASVS Categories (Level 1)

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | watermark is internal `Date`, never user-supplied |
| V6 Cryptography | no | — |

**No new security surface.** Watermark values are internal `Date` objects stored in UserDefaults under the app's sandbox; they are never exposed via network or user input.

---

## Sources

### Primary (HIGH confidence)
- `GooseSwift/GooseUploadService.swift` — complete upload flow, success/failure branches, NSLock pattern [VERIFIED: direct read]
- `GooseSwift/GooseAppModel+Upload.swift` — call sites for upload, `sinceTimestamp` values used [VERIFIED: direct read]
- `GooseSwift/GooseAppModel+BandFirstSync.swift` — `lastHistorySyncAt` UserDefaults pattern, exact analog [VERIFIED: direct read]
- `GooseSwift/GooseBLEBondingManager.swift` — static key constants, `clearAll`-style reset pattern [VERIFIED: direct read]
- `GooseSwift/RemoteServerPersistence.swift` — existing `goose.remote.*` key namespace [VERIFIED: direct read]
- `server/ingest/app/store.py` — `ON CONFLICT (device_id, captured_at, frame_hex) DO NOTHING` [VERIFIED: direct read]
- `server/ingest/app/main.py` — `/v1/ingest-frames` endpoint, response shape `{"inserted": N}` [VERIFIED: direct read]
- `.planning/phases/62-upload-watermark-per-sensor/62-CONTEXT.md` — locked decisions, deferred ideas [VERIFIED: direct read]
- `.planning/ROADMAP.md` — WHOOP reference: WHPStrapLatestUploadedMetricDateKey, watermark shape, StoredWatermarksAtHistoryComplete [VERIFIED: direct read]

### Secondary (MEDIUM confidence)
- WHOOP Ghidra analysis in ROADMAP.md — `watermarksByRevision: [Int: Date]`, `clearAllWatermarks()`, `ecgHighWaterMark`, `WatermarksInteractor` source paths [CITED: .planning/ROADMAP.md lines 392-442]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing platform APIs
- Architecture: HIGH — directly derived from reading all relevant source files
- Pitfalls: HIGH — derived from reading the actual upload success/failure branches
- Server dedup: HIGH — `ON CONFLICT DO NOTHING` confirmed in store.py

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (stable — UserDefaults and URLSession APIs do not change)
