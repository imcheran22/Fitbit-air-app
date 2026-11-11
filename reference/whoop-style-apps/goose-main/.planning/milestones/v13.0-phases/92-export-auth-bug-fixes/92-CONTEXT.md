# Phase 92: Export & Auth Bug Fixes - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

5 Swift-only bug fixes across two subsystems:
1. **Export pipeline OOM** — manifest validation passes by file URL (not in-memory dict); `runFullRawExport()` respects `includeRawBytes = false`; redundant `validate()` call removed from `createBundle()`; "Include Database" button disabled when SQLite > 20 MB.
2. **WHOOP 5.0 auth stuck state** — after 12 failed auth retries, surfaces a UIAlertController/SwiftUI `.alert`; user taps "Reconnect WHOOP" → `disconnect()` + forget remembered device ID; user reconnects manually from scan.

No Rust changes in this phase.

</domain>

<decisions>
## Implementation Decisions

### Auth Recovery UX (BUG-AUTH-01)
- **D-01:** Surface as **alert sheet** (SwiftUI `.alert` / UIAlertController) — interrupts clearly, user must act. Consistent with iOS convention for unrecoverable states.
- **D-02:** Alert fires after the 12th failed retry exhausts the `authRetryPending` cycle.
- **D-03:** Alert action: **disconnect + forget** — calls `disconnect()`, clears `rememberedDeviceID` from UserDefaults, returns user to scan flow. No auto-reconnect — user initiates a new connection manually.
- **D-04:** Retry loop halts immediately on alert (no further `authRetryPending` triggers).

### Manifest By-Reference (BUG-EXP-01)
- **D-05:** `validate()` and downstream bridge calls receive the **file URL/path string** of the already-written `local-health-validation-manifest.json` — not the full `[String: Any]` dict.
- **D-06:** After `writeRawValidationSidecars` writes the manifest JSON to disk, the in-memory dict is released. Subsequent `validation.local_health_manifest_runbook` and related bridge calls pass `["manifest_path": url.path]` instead of `["manifest": dict]`.
- **D-07:** Rust bridge handlers for `validation.local_health_manifest_runbook` (and any other methods receiving the manifest dict) must be updated to accept `manifest_path` and read from disk. This is the only Rust-adjacent change — still a bridge call signature update, not a new Rust feature.

### Export Defaults Fix (BUG-EXP-02)
- **D-08:** `runFullRawExport()` must NOT set `includeRawBytes = false` (or any other override of user-configured `includeRawBytes`). Check and remove any line that overrides this property.

### Redundant validate() (BUG-EXP-03)
- **D-09:** `createBundle()` calls `validate()` exactly once, internally. Any call to `validate()` from the caller side (before or after `createBundle()`) is redundant — remove it.

### Include Database Button Guard (BUG-EXP-04)
- **D-10:** "Include Database" / `families.contains("sqlite")` toggle is **disabled** (greyed out, not hidden) when `fetchSQLiteDBSizeLabel()` returns a size > 20 MB. The existing OOM-risk label text already signals this — add a `.disabled(isDatabaseTooLarge)` computed property.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Export Pipeline
- `GooseSwift/MoreDataStore.swift` — `@Published var includeRawBytes`, `fetchSQLiteDBSizeLabel()`, `runFullRawExport()`, `rawExportStatus`
- `GooseSwift/MoreDataStore+Validation.swift` — `writeRawValidationSidecars()`, `rawValidationRunbookMarkdown()`, `validateRawExportArtifacts()`, `createBundle()` call site at line ~109
- `GooseSwift/GooseLocalDataExporter+FileSystem.swift` — `createBundle()` implementation, `validateSQLiteDatabase()`
- `GooseSwift/MoreRawExportViews.swift` — UI for "Include Database" button

### Auth Retry
- `GooseSwift/CoreBluetoothBLETransport.swift` — `authRetryPending`, `reconnectState`, BLE-REL-01 comment; auth retry logic
- `GooseSwift/GooseBLETypes.swift` — connection state enum (check for new `.authExhausted` case if needed)
- `GooseSwift/ConnectionView.swift` — current reconnect UI surface (for context only)

### Requirements
- `.planning/REQUIREMENTS.md` §BUG-AUTH-01, BUG-EXP-01..04 — requirement IDs and acceptance criteria
- `.planning/ROADMAP.md` §Phase 92 — success criteria and plan breakdown

No external specs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchSQLiteDBSizeLabel()` in `MoreDataStore.swift`: already computes MB and appends "OOM risk" label when > 20 MB — extract the boolean `isDatabaseTooLarge` computed property from this logic for the `.disabled()` modifier.
- `writeRawValidationSidecars()` returns `RawValidationSidecarResult` with `manifestURL: URL` — this URL is the file path reference that replaces the in-memory dict downstream.
- `authRetryPending: Bool` in `CoreBluetoothBLETransport.swift` — tracks pending retry; detect exhaustion here.

### Established Patterns
- Alerts in this codebase use SwiftUI `.alert` with a single destructive + cancel action (see existing confirm-deletion alert in `MorePrivacyView`).
- `rememberedDeviceID` / `rememberedDeviceName` are stored in `DefaultsKey` static constants on `CoreBluetoothBLETransport` — clear both on disconnect+forget.
- Bridge calls use `try bridge.request(method:, args:)` returning `[String: Any]` — updating `manifest_path` arg follows the same pattern.

### Integration Points
- Auth alert triggers inside BLE callback path in `CoreBluetoothBLETransport` — publish state to `@MainActor` via the existing BLE state publishing mechanism before presenting alert.
- Export button guard lives in `MoreRawExportViews.swift` — add `.disabled(viewModel.isDatabaseTooLarge)` on the "Include Database" toggle/button.

</code_context>

<specifics>
## Specific Ideas

- "Reconnect WHOOP" alert should have two actions: **"Reconnect"** (primary, calls disconnect + forget) and **"Cancel"** (secondary, stops retry loop but keeps device remembered — user can retry manually).
- 20 MB threshold is already coded in `fetchSQLiteDBSizeLabel()` — reuse same constant, don't introduce a new magic number.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 92-Export & Auth Bug Fixes*
*Context gathered: 2026-06-19*
