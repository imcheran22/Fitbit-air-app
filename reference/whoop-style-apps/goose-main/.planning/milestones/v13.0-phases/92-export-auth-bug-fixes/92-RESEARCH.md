# Phase 92: Export & Auth Bug Fixes - Research

**Researched:** 2026-06-19
**Domain:** Swift iOS — BLE auth retry, export pipeline memory management
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auth Recovery UX (BUG-AUTH-01)**
- D-01: Surface as alert sheet (SwiftUI `.alert` / UIAlertController) — interrupts clearly, user must act. Consistent with iOS convention for unrecoverable states.
- D-02: Alert fires after the 12th failed retry exhausts the `authRetryPending` cycle.
- D-03: Alert action: disconnect + forget — calls `disconnect()`, clears `rememberedDeviceID` from UserDefaults, returns user to scan flow. No auto-reconnect — user initiates a new connection manually.
- D-04: Retry loop halts immediately on alert (no further `authRetryPending` triggers).

**Manifest By-Reference (BUG-EXP-01)**
- D-05: `validate()` and downstream bridge calls receive the file URL/path string of the already-written `local-health-validation-manifest.json` — not the full `[String: Any]` dict.
- D-06: After `writeRawValidationSidecars` writes the manifest JSON to disk, the in-memory dict is released. Subsequent `validation.local_health_manifest_runbook` and related bridge calls pass `["manifest_path": url.path]` instead of `["manifest": dict]`.
- D-07: Rust bridge handlers for `validation.local_health_manifest_runbook` (and any other methods receiving the manifest dict) must be updated to accept `manifest_path` and read from disk.

**Export Defaults Fix (BUG-EXP-02)**
- D-08: `runFullRawExport()` must NOT set `includeRawBytes = false` (or any other override of user-configured `includeRawBytes`). Check and remove any line that overrides this property.

**Redundant validate() (BUG-EXP-03)**
- D-09: `createBundle()` calls `validate()` exactly once, internally. Any call to `validate()` from the caller side (before or after `createBundle()`) is redundant — remove it.

**Include Database Button Guard (BUG-EXP-04)**
- D-10: "Include Database" / `families.contains("sqlite")` toggle is disabled (greyed out, not hidden) when `fetchSQLiteDBSizeLabel()` returns a size > 20 MB. Add `.disabled(isDatabaseTooLarge)` computed property.

### Claude's Discretion

- Specific wording of alert title/message and button labels (e.g., "Reconnect WHOOP" vs "Device Connection Failed")
- Whether `.authExhausted` connection state case is needed or a boolean published property suffices
- Bridge method name for `manifest_path` argument (update existing method vs. new method)

### Deferred Ideas (OUT OF SCOPE)

None.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BUG-AUTH-01 | User can recover from WHOOP 5.0 auth stuck state — app detects retry exhaustion, surfaces clear "Reconnect WHOOP" prompt, halts retry loop | Auth retry counter + SwiftUI `.alert` + `clearRememberedDevice(reason:)` |
| BUG-EXP-01 | Export on databases > 100 MB completes without OOM crash — validation pipeline passes manifest by reference/ID | Change `rawValidationRunbookMarkdown` and review bridge calls to use `manifest_path` + Rust side to read from disk |
| BUG-EXP-02 | `runFullRawExport()` respects `includeRawBytes = false` | Remove line 82 (`includeRawBytes = true`) from `runFullRawExport()` in `MoreDataStore+Validation.swift` |
| BUG-EXP-03 | `validate()` called exactly once inside `createBundle()` — redundant call removed | Remove the second duplicate `validate(...)` closure block (lines 578–584 in `GooseLocalDataExporter.swift`) |
| BUG-EXP-04 | "Include Database" button disabled when SQLite > 20 MB | Add `isDatabaseTooLarge` computed property; apply `.disabled()` in `MoreRawExportViews.swift` |
</phase_requirements>

---

## Summary

Phase 92 is a **5-fix Swift-only bug fix phase** across two subsystems. No new features, no Rust recompile needed for most fixes — only BUG-EXP-01 requires a Rust bridge signature change (adding `manifest_path` support to `LocalHealthValidationManifestRunbookArgs` and `LocalHealthValidationManifestReviewArgs`).

**Export subsystem (4 fixes):** The OOM crash on large databases (BUG-EXP-01) is caused by the in-memory manifest `[String: Any]` dict being passed to `rawValidationRunbookMarkdown()` and `validation.local_health_manifest_review` bridge calls after `writeRawValidationSidecars()` has already written it to disk. The fix is to pass the `manifestURL.path` instead. BUG-EXP-02 is a single line removal in `runFullRawExport()`. BUG-EXP-03 is removing one of two identical `validate()` calls inside `createBundle()`. BUG-EXP-04 is a `isDatabaseTooLarge` computed property + `.disabled()` modifier.

**Auth subsystem (1 fix):** The current BLE auth retry mechanism uses a single Boolean (`authRetryPending`) tracking "one retry in flight." The CONTEXT states the alert should fire after "12 failed retries exhausts the `authRetryPending` cycle." This means a **counter** (`authRetryCount: Int`) must be added alongside `authRetryPending`. When the count reaches 12, the loop halts and the alert is presented. The alert calls `clearRememberedDevice(reason: "auth_exhausted")` (which already clears both UserDefaults keys and the in-memory IDs) and stops the retry cycle.

**Primary recommendation:** Execute fixes in dependency order: BUG-EXP-02 (trivial), BUG-EXP-03 (trivial), BUG-EXP-04 (trivial), BUG-EXP-01 (Rust + Swift change), BUG-AUTH-01 (new counter + alert wiring).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OOM-safe manifest passing | Rust bridge (disk read) | Swift (passes path, not dict) | Rust already reads from disk elsewhere; passing path string eliminates in-memory object lifetime entirely |
| Auth retry exhaustion detection | Swift BLE layer | — | `authRetryPending` already lives in `CoreBluetoothBLETransport`; counter goes next to it |
| Auth alert presentation | SwiftUI view layer | — | Alert must interrupt current view; wired via `@Published` boolean on `@Observable` BLE transport or `GooseAppModel` |
| DB size guard (UI disable) | SwiftUI view (`MoreRawExportViews`) | ViewModel (`MoreDataStore`) | Logic is a computed property on `MoreDataStore`; view applies `.disabled()` |
| `runFullRawExport` defaults | `MoreDataStore+Validation.swift` | — | Single method, single file, single line removal |
| Redundant validate() removal | `GooseLocalDataExporter.swift` | — | createBundle() owns the validation path; the second call is dead code |

---

## Standard Stack

### Core
No new external dependencies. All changes use existing Swift/SwiftUI/CoreBluetooth/Rust-bridge infrastructure.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SwiftUI `.alert` | iOS 26 SDK | Auth stuck alert presentation | Established codebase pattern; see `MoreDebugViews.swift`, `HealthSleepSheetsViews.swift` |
| `CoreBluetoothBLETransport` | existing | BLE auth retry tracking | Sole concrete `BLETransport` implementation |
| `GooseRustBridge` | existing | JSON-RPC to Rust | Existing FFI bridge; bridge call signature change only |
| `MoreDataStore` | existing | Export configuration, DB size | Source of `fetchSQLiteDBSizeLabel()` and `includeRawBytes` |

---

## Architecture Patterns

### System Architecture Diagram

```
[User taps Export]
       │
       ▼
MoreRawExportViews (.confirmationDialog)
       │ "Include Database" button
       │ .disabled(isDatabaseTooLarge)  ← BUG-EXP-04 guard
       ▼
MoreDataStore.runRawExport(preset: .includeDatabase)
       │
       ▼
MoreDataStore.performRawExport(families:rawBytes:)
       │ background queue
       ▼
bridge.request("export.raw_timeframe")
       │
       ▼
MoreDataStore+Validation.writeRawValidationSidecars()
       │ writes manifest to disk → returns manifestURL
       │ in-memory dict RELEASED after this point ← BUG-EXP-01
       ▼
bridge.request("validation.local_health_manifest_runbook", args: ["manifest_path": url.path])
       │ Rust reads JSON from disk ← bridge signature change
       ▼
bridge.request("validation.local_health_manifest_review", args: ["manifest_path": url.path])
       │ Rust reads JSON from disk ← bridge signature change
       ▼
validateRawExportArtifacts() → DispatchQueue.main result update


[WHOOP 5.0 auth failure flow]
CoreBluetoothBLETransport.peripheral(_:didWriteValueFor:error:)
       │ CBATTError.insufficientAuthentication
       ▼
authRetryCount += 1
       │ < 12?  → authRetryPending = true → schedule retry after 2.5s ← BUG-AUTH-01 counter
       │ >= 12? → halt, set showAuthExhaustedAlert = true
       ▼
GooseAppModel or ConnectionView
       │ observes showAuthExhaustedAlert
       ▼
SwiftUI .alert("Unable to Authenticate WHOOP")
       │ "Reconnect WHOOP" button
       ▼
clearRememberedDevice(reason: "auth_exhausted") + stopReconnect()
       │ clears rememberedDeviceID/Name from UserDefaults
       ▼
User returns to scan flow
```

### Recommended Project Structure

No structural changes. All edits are to existing files:

```
GooseSwift/
├── CoreBluetoothBLETransport.swift       # add authRetryCount: Int = 0
├── CoreBluetoothBLETransport+PeripheralDelegate.swift  # counter logic + alert trigger
├── MoreDataStore+Validation.swift        # BUG-EXP-02: remove includeRawBytes = true
│                                         # BUG-EXP-01: pass manifest_path not dict
├── GooseLocalDataExporter.swift          # BUG-EXP-03: remove second validate() call
├── MoreRawExportViews.swift              # BUG-EXP-04: .disabled(isDatabaseTooLarge)
├── MoreDataStore.swift                   # BUG-EXP-04: isDatabaseTooLarge computed prop
└── (alert surface — see BUG-AUTH-01 below)
Rust/core/src/bridge/debug.rs            # BUG-EXP-01: add manifest_path support to Runbook/Review args
```

---

## Exact Code Locations and Changes

### BUG-EXP-02 — Remove `includeRawBytes = true` override

**File:** `GooseSwift/MoreDataStore+Validation.swift`
**Location:** `func runFullRawExport()` — line 82

Current code:
```swift
func runFullRawExport() {
  rawExportStart = Self.fullExportStart
  rawExportEnd = Date().addingTimeInterval(60).moreISO8601String()
  rawCaptureSessions = ""
  rawPacketTypes = ""
  rawSensorSignals = ""
  rawMetricFamilies = ""
  rawAlgorithmIDs = ""
  rawAlgorithmVersions = ""
  includeRawBytes = true   // ← BUG: overrides user preference with true
  selectedRawFamilies = Set(Self.rawFamilies)
  runRawExport()
}
```

Fix: Remove the `includeRawBytes = true` line. `includeRawBytes` is declared in `MoreDataStore.swift` as `@Published var includeRawBytes = false` and reflects the user's Toggle. `runRawExport()` already reads `includeRawBytes` correctly. [VERIFIED: codebase grep]

---

### BUG-EXP-03 — Remove redundant `validate()` in `createBundle()`

**File:** `GooseSwift/GooseLocalDataExporter.swift`
**Location:** `createBundle()` — there are TWO identical `validate(...)` calls:

1. Line ~543 (inside the `do` block, used to compute `validation` for the JSON summary)
2. Line ~578 (AFTER the `do/catch` block, used to compute `resultValidation`)

The second call at line ~578 computes an identical result to line ~543 (same arguments: `exportedRelativePaths`, `requiredOvernightSessionID`, `documentsDirectory`, `fileManager`). The result from line 543 is already available as `validation` and could be reused.

Fix: Assign the first `validate()` result to a `let`, then reuse it for both the JSON summary write (inside `do`) and the `resultValidation` computation (after `catch`). The second `validate()` call (lines 578–584) is removed. [VERIFIED: codebase grep]

**Pattern:** Lift `validate(...)` into a variable before the `do` block, then reference it in both places:
```swift
let baseValidation = validate(
  exportedRelativePaths: exportedRelativePaths,
  requiredOvernightSessionID: requiredOvernightSessionID,
  documentsDirectory: documentsDirectory,
  fileManager: fileManager
)
```

---

### BUG-EXP-04 — Disable "Include Database" button when SQLite > 20 MB

**File 1:** `GooseSwift/MoreDataStore.swift`

Add computed property:
```swift
var isDatabaseTooLarge: Bool {
  guard !databasePath.isEmpty,
        let attrs = try? FileManager.default.attributesOfItem(atPath: databasePath),
        let bytes = attrs[.size] as? Int64 else { return false }
  let mb = Double(bytes) / 1_048_576
  return mb > 20
}
```

This reuses the exact same threshold logic as `fetchSQLiteDBSizeLabel()` — no new magic number. [VERIFIED: codebase grep]

**File 2:** `GooseSwift/MoreRawExportViews.swift`

The "Include Database" option is inside a `.confirmationDialog`. The individual `Button` items inside a `confirmationDialog` do not support `.disabled()` modifiers directly in SwiftUI — the standard approach is to conditionally omit the button or update the `label` text.

**Confirmed pattern:** The CONTEXT specifies "disabled (greyed out, not hidden)." In a `confirmationDialog`, SwiftUI does not support `.disabled()` on individual action buttons. The correct approach for this UI is either:

- **Option A (preferred per D-10):** Use the existing `sqliteDBSizeLabel` (already loaded on sheet open) to show the size suffix, and add a separate toggle/row in the "Data Families" section that is `.disabled(store.isDatabaseTooLarge)`. The `ExportPreset.includeDatabase` confirmation dialog button stays but the family toggle governing SQLite is greyed out.
- **Option B:** In `MoreRawExportViews`, the `sqlite` family `Toggle` in the "Data Families" section already exists: `ForEach(MoreDataStore.rawFamilies, ...)`. That toggle binds to `store.setRawFamily(_:enabled:)`. Add `.disabled(store.isDatabaseTooLarge)` to the `sqlite` toggle row only.

**Decision (Claude's discretion):** Option B is simpler and directly matches "disabled (greyed out, not hidden)" — the `sqlite` toggle in the Data Families section becomes disabled when DB > 20 MB, preventing the user from selecting it. The confirmation dialog button text already appends the size via `sqliteDBSizeLabel`. [ASSUMED — final approach to be confirmed during planning]

---

### BUG-EXP-01 — Manifest by-reference (OOM fix)

**Issue:** After `writeRawValidationSidecars()` returns, the in-memory manifest dict is still held by the `performRawExport` closure and passed to:
1. `rawValidationRunbookMarkdown(bridge:manifest:)` — passes `["manifest": manifest]` to `validation.local_health_manifest_runbook`
2. `bridge.request("validation.local_health_manifest_review", args: ["manifest": manifest])`

Both calls serialize the entire `[String: Any]` dict again, keeping it alive. For databases > 100 MB, the manifest dict can be multi-MB.

**Fix — Swift side (`MoreDataStore+Validation.swift`):**

Change `rawValidationRunbookMarkdown` signature to accept path:
```swift
nonisolated static func rawValidationRunbookMarkdown(
  bridge: GooseRustBridge,
  manifestPath: String       // was: manifest: [String: Any]
) throws -> String {
  let result = try bridge.request(
    method: "validation.local_health_manifest_runbook",
    args: ["manifest_path": manifestPath]  // was: ["manifest": manifest]
  )
  // ...
}
```

And the review call inside `performRawExport`:
```swift
let review = try bridge.request(
  method: "validation.local_health_manifest_review",
  args: ["manifest_path": validationSidecars.manifestURL!.path]  // was: ["manifest": manifest]
)
```

The call sequence becomes:
1. `bridge.request("validation.local_health_manifest_scaffold", ...)` → returns `manifest` dict
2. `writeRawValidationSidecars(manifest, ...)` → writes to disk, returns `RawValidationSidecarResult` with `manifestURL`
3. **Release in-memory `manifest` dict**
4. `rawValidationRunbookMarkdown(bridge: bridge, manifestPath: manifestURL.path)` → Rust reads from disk
5. `bridge.request("validation.local_health_manifest_review", args: ["manifest_path": manifestURL.path])` → Rust reads from disk

**Fix — Rust side (`Rust/core/src/bridge/debug.rs`):**

Update `LocalHealthValidationManifestRunbookArgs` to accept either `manifest` (backwards compat) or `manifest_path`:
```rust
#[derive(Debug, Clone, Deserialize)]
struct LocalHealthValidationManifestRunbookArgs {
    manifest: Option<serde_json::Value>,
    manifest_path: Option<String>,
}
```

And `local_health_validation_manifest_runbook_bridge`:
```rust
fn local_health_validation_manifest_runbook_bridge(
    args: LocalHealthValidationManifestRunbookArgs,
) -> GooseResult<serde_json::Value> {
    let manifest = if let Some(path) = args.manifest_path {
        let raw = fs::read_to_string(&path)
            .map_err(|e| GooseError::message(format!("manifest_path read failed: {e}")))?;
        serde_json::from_str(&raw)
            .map_err(|e| GooseError::message(format!("manifest_path parse failed: {e}")))?
    } else if let Some(m) = args.manifest {
        m
    } else {
        return Err(GooseError::message("manifest or manifest_path is required"));
    };
    // ... rest unchanged
}
```

Same pattern for `LocalHealthValidationManifestReviewArgs` / `local_health_validation_manifest_review_bridge`. [VERIFIED: codebase grep — current struct only has `manifest: serde_json::Value`] [ASSUMED — `fs::read_to_string` is already imported in Rust codebase; verified by `export.rs` usage at line 563]

---

### BUG-AUTH-01 — Auth exhaustion alert

**Current state:** `authRetryPending: Bool` (line 342 in `CoreBluetoothBLETransport.swift`) tracks whether a single 2.5s retry is in flight. The existing code already has a "second failure" path that calls `updateConnectionState("Authentication failed — please reconnect WHOOP")` but does not halt the reconnect cycle or alert the user.

**CONTEXT.md says "12 failed retries exhaust the `authRetryPending` cycle."** This means the intent is: each reconnect attempt → one `authRetryPending` cycle → if the cycle ends in second failure, count it. After 12 such counted failures, fire the alert.

**New variable:** Add `authRetryCount: Int = 0` next to `authRetryPending` in `CoreBluetoothBLETransport.swift`.

**Alert trigger:** In `CoreBluetoothBLETransport+PeripheralDelegate.swift`, in the "second failure" path (where `authRetryPending = false` is set after the retry window):

```swift
// Second failure after the retry window: reset flag and fall through to show error.
authRetryPending = false
authRetryCount += 1
if authRetryCount >= 12 {
  authRetryCount = 0
  // Halt retry loop, fire alert
  showAuthExhaustedAlert()
  return
}
updateConnectionState("Authentication failed — please reconnect WHOOP")
```

**Alert surface — Claude's discretion:**

Two approaches exist; the simplest consistent with the codebase is a `@Published` boolean on a type that the view layer observes:

- `CoreBluetoothBLETransport` is `@Observable` (not `ObservableObject`). Adding `var authExhaustedAlertShowing = false` as an `@Observable` property is the clean path.
- The view that presents the alert needs access to `ble: any BLETransport`. `ConnectionView` already has `var ble: any BLETransport` — this is the natural surface.
- Add `.alert` to `ConnectionContentView` in `ConnectionView.swift`.

**Alert action:**

```swift
.alert("Unable to Authenticate WHOOP", isPresented: $ble.authExhaustedAlertShowing) {
  Button("Reconnect WHOOP", role: .destructive) {
    ble.clearRememberedDevice(reason: "auth_exhausted")
    ble.stopReconnect()
  }
  Button("Cancel", role: .cancel) {
    ble.stopReconnect()  // stop retrying but keep device remembered
  }
} message: {
  Text("Authentication failed after 12 attempts. Tap Reconnect to start fresh.")
}
```

`clearRememberedDevice(reason:)` already handles:
- `defaults.removeObject(forKey: DefaultsKey.rememberedDeviceID)`
- `defaults.removeObject(forKey: DefaultsKey.rememberedDeviceName)`
- `defaults.removeObject(forKey: DefaultsKey.rememberedDeviceValidated)`
- `rememberedDeviceID = nil`, `rememberedDeviceName = nil`
- `autoReconnectTargetID = nil`
- `cancelReconnectCycle()`

[VERIFIED: codebase grep — `clearRememberedDevice` at `CoreBluetoothBLETransport+Commands.swift` line 670]

**Reset:** `authRetryCount` must be reset to 0 in the same places `authRetryPending = false` is reset on clean connect/disconnect:
- `CoreBluetoothBLETransport+CentralDelegate.swift` line 278 (`authRetryPending = false`)
- `peripheral(_:didWriteValueFor:error:)` success path (line 375)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth alert presentation | Custom overlay, banner, or sheet | SwiftUI `.alert` | iOS system pattern; already used in MoreDebugViews, HealthSleepSheetsViews, LiveActivityContentView |
| Forget device + stop retry | Manual UserDefaults.removeObject calls inline | `clearRememberedDevice(reason:)` + `stopReconnect()` | Already handles all state cleanup atomically; adding inline removes risks missing `autoReconnectTargetID`, `whoopCandidateIDs`, etc. |
| DB size check | Re-implement FileManager attribute read | Extract bool from existing `fetchSQLiteDBSizeLabel()` logic | Same code path, same threshold (> 20 MB / 1_048_576) — avoids diverging magic numbers |
| Manifest disk read (Rust) | Custom parser | `fs::read_to_string` + `serde_json::from_str` | Already pattern used in `export.rs` line 563 and `local_health_validation.rs` line 3050 |

---

## Common Pitfalls

### Pitfall 1: BLETransport protocol doesn't expose `authExhaustedAlertShowing`
**What goes wrong:** `ConnectionContentView` has `ble: any BLETransport` — the protocol. Adding `authExhaustedAlertShowing` only to `CoreBluetoothBLETransport` (concrete type) means the view can't bind to it without a cast.
**Why it happens:** `BLETransport` is the protocol that views depend on; concrete-only properties aren't visible.
**How to avoid:** Add `var authExhaustedAlertShowing: Bool { get set }` to the `BLETransport` protocol in `BLETransport.swift`, with a default no-op in the extension. The concrete implementation sets it to `true` when the alert triggers.
**Warning signs:** Compiler error "value of type 'any BLETransport' has no member 'authExhaustedAlertShowing'."

### Pitfall 2: `.confirmationDialog` buttons don't support `.disabled()`
**What goes wrong:** Adding `.disabled(store.isDatabaseTooLarge)` to the "Include Database" `Button` inside `.confirmationDialog` is silently ignored by SwiftUI — confirmation dialog actions do not propagate `.disabled`.
**Why it happens:** SwiftUI's `confirmationDialog` renders system-level action sheets, not View-hierarchy buttons.
**How to avoid:** Apply the guard to the `sqlite` family `Toggle` in the "Data Families" section, not to the confirmation dialog button.

### Pitfall 3: Second `validate()` call in `createBundle()` holds state needed for `resultValidation`
**What goes wrong:** Removing the second `validate()` call naively breaks `resultValidation` computation — it was being used to produce the final `GooseLocalDataExportResult`.
**Why it happens:** The first call's result exists only inside the `do` block (used for the JSON summary). The second call was the only source of `validation` in scope for `resultValidation`.
**How to avoid:** Hoist the `validate()` call before the `do` block, assign to a `let` variable, and use it in both places. The result is identical either way (same arguments), so no logic changes.

### Pitfall 4: `authRetryCount` not reset on clean connect — double-counting across sessions
**What goes wrong:** After the user reconnects manually (clean connect, no auth failure), `authRetryCount` retains its old value and the new session reaches the threshold prematurely.
**Why it happens:** `authRetryPending` is already reset at 3 sites; `authRetryCount` must be reset at the same sites.
**How to avoid:** Add `authRetryCount = 0` wherever `authRetryPending = false` is set unconditionally (central delegate on connect, success write path).

### Pitfall 5: `manifest_path` Rust change needs `use std::fs` in scope
**What goes wrong:** `fs::read_to_string` fails to compile if `std::fs` is not imported in `bridge/debug.rs`.
**Why it happens:** `debug.rs` may not have `use std::fs;` at the top.
**How to avoid:** Check imports at top of `Rust/core/src/bridge/debug.rs` before writing the implementation. Add `use std::fs;` if absent.

### Pitfall 6: `manifest_path` Rust args need `#[serde(default)]` on the optional fields
**What goes wrong:** If either `manifest` or `manifest_path` field is absent from the JSON, Deserialize fails on a non-`Option` field.
**Why it happens:** Serde requires `#[serde(default)]` or `Option<T>` for optional JSON fields.
**How to avoid:** Both new fields must be `Option<...>` with `#[serde(default)]` or just `Option<...>` (which defaults to `None`). Validate that at least one is `Some` in the bridge function.

---

## Code Examples

### Existing alert pattern (from MoreDebugViews.swift)
```swift
// Source: GooseSwift/MoreDebugViews.swift line 384
.alert("Destructive commands are locked", isPresented: $showDestructiveConfirmation) {
  Button("Keep Locked", role: .cancel) {
    store.showDestructiveGate()
  }
} message: {
  Text("This surface records the gate only.")
}
```

### Existing clearRememberedDevice (from CoreBluetoothBLETransport+Commands.swift)
```swift
// Source: GooseSwift/CoreBluetoothBLETransport+Commands.swift line 670
func clearRememberedDevice(reason: String, source: String = "ble") {
  if !Thread.isMainThread {
    DispatchQueue.main.async { [weak self] in self?.clearRememberedDevice(reason: reason, source: source) }
    return
  }
  // clears UserDefaults rememberedDeviceID, rememberedDeviceName, rememberedDeviceValidated
  // sets rememberedDeviceID = nil, rememberedDeviceName = nil
  // calls autoReconnectTargetID = nil, cancelReconnectCycle()
}
```

### Existing isDatabaseTooLarge logic (from MoreDataStore.swift)
```swift
// Source: GooseSwift/MoreDataStore.swift — fetchSQLiteDBSizeLabel()
func fetchSQLiteDBSizeLabel() -> String {
  guard !databasePath.isEmpty,
        let attrs = try? FileManager.default.attributesOfItem(atPath: databasePath),
        let bytes = attrs[.size] as? Int64 else { return "" }
  let mb = Double(bytes) / 1_048_576
  if mb > 20 { return " (\(Int(mb))MB — OOM risk)" }
  return " (\(Int(mb))MB)"
}
```

### Rust manifest_path pattern already in codebase (from export.rs)
```rust
// Source: Rust/core/src/export.rs line 563
let manifest_raw = fs::read_to_string(&manifest_path)
    .map_err(|source| GooseError::io(&manifest_path, source))?;
```

---

## Runtime State Inventory

This section is omitted — Phase 92 is a bug fix phase, not a rename/refactor/migration phase. No persistent state is renamed or migrated.

---

## Environment Availability

Phase 92 is Swift-only code edits plus one Rust bridge signature change. The Rust change requires a rebuild of `libgoose_core.a`.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode | iOS build | ✓ | Xcode 26.5 / Swift 6.3.2 | — |
| Rust toolchain | BUG-EXP-01 (bridge rebuild) | ✓ | MSRV 1.94, aarch64-apple-ios target | — |
| `Scripts/build_ios_rust.sh` | Rebuild static lib | ✓ | Existing build phase | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Rust: `cargo test` / Swift: Xcode (no Swift test target detected) |
| Config file | `Rust/core/Cargo.lock` |
| Quick run command | `cd Rust/core && cargo test --lib 2>&1 \| tail -5` |
| Full suite command | `cd Rust/core && cargo test 2>&1 \| tail -20` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-EXP-01 | Manifest path accepted by Rust runbook/review handlers | unit (Rust) | `cargo test local_health_validation` | ✅ tests exist in `local_health_validation.rs` |
| BUG-EXP-02 | `runFullRawExport` does not override includeRawBytes | manual | Simulator: tap "Full Raw Export" with toggle off, verify flag | ❌ no Swift test target |
| BUG-EXP-03 | validate() called once | code review | grep validate in createBundle | N/A — removal |
| BUG-EXP-04 | sqlite toggle disabled when DB > 20 MB | manual | Simulator screenshot | ❌ no Swift test target |
| BUG-AUTH-01 | Alert fires at retry count 12, clears device | manual | Simulator BLE mock or device | ❌ no Swift test target |

### Sampling Rate
- **Per task commit:** `cd /Users/francisco/Documents/goose/Rust/core && cargo build --lib 2>&1 | tail -5`
- **Per wave merge (BUG-EXP-01):** `cd /Users/francisco/Documents/goose/Rust/core && cargo test 2>&1 | tail -20`
- **Phase gate:** iOS build compiles without new warnings (`xcodebuild build` succeeds)

### Wave 0 Gaps
- No new test files required — Rust tests exist for validation; Swift has no test target. Manual simulator verification is the gate for Swift-only fixes.

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes (Rust bridge args) | Validate `manifest_path` is non-empty before `fs::read_to_string` |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `manifest_path` | Tampering | Validate path is within the app's Documents/Application Support sandbox before reading; or accept the trust boundary (Swift caller is the only source, app-sandboxed) |

**Note on path traversal:** The `manifest_path` value originates from `writeRawValidationSidecars()` which constructs the URL from the app's own documents directory — there is no user-controlled input. Trust boundary is within the app process. No additional validation needed for ASVS Level 1. [ASSUMED — path trust analysis based on code reading]

---

## Package Legitimacy Audit

No new packages are introduced in this phase. No audit required.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The "12 failed auth retries" means counting each `authRetryPending` second-failure, not 12 raw `insufficientAuthentication` errors | BUG-AUTH-01 | Counter threshold is set incorrectly; alert fires too early or too late |
| A2 | `confirmationDialog` buttons don't support `.disabled()` in iOS 26 SDK | BUG-EXP-04 | Planned workaround (disable sqlite Toggle) may be unnecessary if Apple added support |
| A3 | `fs::read_to_string` is available in `bridge/debug.rs` scope (or needs `use std::fs` added) | BUG-EXP-01 Rust | Minor compile error if import is missing; trivial fix |
| A4 | Both `LocalHealthValidationManifestReviewArgs` and `LocalHealthValidationManifestRunbookArgs` need updating (not just Runbook) | BUG-EXP-01 | Review call still holds in-memory dict if only Runbook is updated |
| A5 | The second `validate()` call at ~line 578 in `createBundle()` produces identical output to the first (same arguments) | BUG-EXP-03 | If arguments diverge due to state mutation between calls, removing the second changes behavior |

---

## Open Questions

1. **Alert presentation surface for BUG-AUTH-01**
   - What we know: `ConnectionView` and `ConnectionContentView` have access to `ble: any BLETransport`; `GooseAppModel` also owns `ble`
   - What's unclear: Whether to add `authExhaustedAlertShowing` to the `BLETransport` protocol or route via `GooseAppModel` (which is already `@EnvironmentObject` everywhere)
   - Recommendation: Add to `BLETransport` protocol — keeps the alert co-located with BLE state; `GooseAppModel` route would work too but adds indirection

2. **Cancel action in auth alert — should it keep or clear the device?**
   - What we know: CONTEXT D-03 says "Reconnect" → disconnect+forget; "Cancel" → stop retrying but keep device remembered
   - What's unclear: After "Cancel", should the retry counter reset to 0 or stay at 12?
   - Recommendation: Reset to 0 on Cancel so the user could theoretically try again manually without immediately re-triggering the alert

---

## Sources

### Primary (HIGH confidence)
- Codebase grep + Read — `GooseSwift/CoreBluetoothBLETransport.swift`, `+PeripheralDelegate.swift`, `+Commands.swift` — verified auth retry pattern, `clearRememberedDevice` implementation, `DefaultsKey` constants
- Codebase grep + Read — `GooseSwift/MoreDataStore.swift`, `MoreDataStore+Validation.swift` — verified `includeRawBytes`, `fetchSQLiteDBSizeLabel`, `runFullRawExport`, `writeRawValidationSidecars`, `RawValidationSidecarResult.manifestURL`
- Codebase grep + Read — `GooseSwift/GooseLocalDataExporter.swift` — verified two `validate()` calls at lines 543 and 578
- Codebase grep + Read — `Rust/core/src/bridge/debug.rs` lines 338–385 — verified `LocalHealthValidationManifestRunbookArgs { manifest: serde_json::Value }` current signature

### Secondary (MEDIUM confidence)
- Codebase grep — `GooseSwift/MoreRawExportViews.swift` — confirmed confirmationDialog structure and sqlite button location
- Codebase grep — `GooseSwift/GooseBLEReconnect.swift` — confirmed `ReconnectBackoff.maxAttempts = 10`; auth retry is separate mechanism

---

## Metadata

**Confidence breakdown:**
- Bug locations: HIGH — all bugs verified against exact source lines
- Fix approaches: HIGH — all patterns verified against existing codebase usage
- Rust bridge change: HIGH — current struct verified; `fs::read_to_string` pattern confirmed from `export.rs`
- Auth retry counter: MEDIUM — count of 12 per CONTEXT.md D-02; exact threshold interpretation marked [ASSUMED]
- confirmationDialog `.disabled()` limitation: MEDIUM — iOS SDK behavior, marked [ASSUMED]

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (stable codebase, no external deps)
