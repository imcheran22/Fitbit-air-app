---
phase: 25-recovery-score-v1
reviewed: 2026-06-08T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - Rust/core/src/metrics.rs
  - Rust/core/src/bridge.rs
  - GooseSwift/HealthDataStore+Recovery.swift
  - GooseSwift/HealthRecoveryStressViews.swift
findings:
  critical: 2
  warning: 2
  info: 1
  total: 5
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-06-08
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the Recovery Score V1 implementation across the Rust algorithm layer (`metrics.rs`), bridge dispatch (`bridge.rs`), Swift data layer (`HealthDataStore+Recovery.swift`), and views (`HealthRecoveryStressViews.swift`).

The Rust side is correct: logistic formula is right (Z=0 → ≈57.9%, within 0.5% of 58%), combined-Z weights are correct (0.7 HRV, -0.3 RHR), cold-start gate fires at < 4 nights, colour band boundaries match spec (Verde ≥ 67, Amarelo 34–66, Vermelho < 34), trust transitions are correct (Calibrating < 4, Provisional 4–13, Trusted ≥ 14), and the bridge dispatch is wired correctly to `metrics.goose_recovery_v1`.

**One critical bug will cause every colour band lookup to silently produce orange regardless of the actual score.** A second critical issue causes a hardcoded synthetic RHR value to corrupt the z_rhr component silently when real RHR data is unavailable. Two additional warnings cover threading pattern inconsistency and registration gaps.

---

## Critical Issues

### CR-01: Colour band case mismatch — bandColor always returns orange

**File:** `GooseSwift/HealthDataStore+Recovery.swift:16-22`

**Issue:** The `bandColor` computed property on `RecoveryV1Result` switches on `colourBand` using title-cased string literals (`"Verde"`, `"Amarelo"`, `"Vermelho"`). The Rust `ColourBand::as_str()` method emits lowercase strings: `"verde"`, `"amarelo"`, `"vermelho"`. No case will ever match; the switch falls through to `default: return .orange` on every call. The colour capsule in `RecoveryV2OverviewPage` (line 71–74 in `HealthRecoveryStressViews.swift`) will always render orange regardless of the user's actual recovery score.

The cold-start default in the Swift bridge call (`?? "Amarelo"`, line 119 in `HealthDataStore+Recovery.swift`) is also title-cased and would fail the same switch, though it is only reached on bridge error paths.

**Fix:**
```swift
// HealthDataStore+Recovery.swift — line 16
var bandColor: Color {
  switch colourBand {
  case "verde": return .green      // was "Verde"
  case "amarelo": return .orange   // was "Amarelo"
  case "vermelho": return .red     // was "Vermelho"
  default: return .orange
  }
}
```

Also fix the bridge fallback default on line 119:
```swift
let colourBand = report["colour_band"] as? String ?? "amarelo"  // was "Amarelo"
```

---

### CR-02: Hardcoded RHR sentinel silently corrupts z_rhr when real RHR is unavailable

**File:** `GooseSwift/HealthDataStore+Recovery.swift:96`

**Issue:** When `restingHrBpm` resolves to `nil` (no device data, no packet rollup, no HealthKit RHR), the code substitutes `55.0` as a synthetic value:

```swift
let rhr = restingHrBpm ?? 55.0
```

This value is then passed to the Rust bridge as `resting_hr_bpm`. If the RHR EWMA baseline has fewer than 4 nights, Rust returns `z_rhr: None` — safe. But once the RHR baseline has ≥ 4 nights, Rust computes a real z_rhr against the personal RHR mean. If the user's actual resting HR differs from 55, the synthetic value produces a non-zero z_rhr that is weighted at 0.3 in the combined-Z formula, biasing the recovery score without any indication to the user or developer.

The Rust algorithm already supports a z_hrv-only mode when z_rhr is None (the `None => z_hrv_val` branch in `goose_recovery_v1`). The correct fix is to omit the RHR argument entirely and let Rust handle the fallback — or, if the bridge requires the field, to signal absence explicitly.

**Fix option A — pass RHR only when known:**
```swift
// Build args conditionally
var args: [String: Any] = [
  "database_path": db,
  "device_id": deviceID,
  "date_key": dateKey,
  "hrv_rmssd_ms": hrv,
]
if let rhr = restingHrBpm {
  args["resting_hr_bpm"] = rhr
}
```

This requires making `resting_hr_bpm` optional in `RecoveryV1BridgeArgs` on the Rust side:
```rust
// bridge.rs
struct RecoveryV1BridgeArgs {
    database_path: String,
    device_id: String,
    date_key: String,
    hrv_rmssd_ms: f64,
    resting_hr_bpm: Option<f64>,   // was f64
}
```

And in `goose_recovery_v1_bridge`, pass a sentinel RHR only when `Some`, or construct an input that the Rust function treats as RHR-absent by ensuring the RHR baseline remains cold.

**Fix option B (simpler) — treat nil RHR as zero nights in the bridge:**
Keep the Swift side sending `rhr: 0.0` (or any sentinel) and add a check in `goose_recovery_v1_bridge` that forces `resting_hr_bpm` to be skipped from the EWMA computation when a sentinel is detected. However, option A is cleaner and aligns with the existing design intent.

---

## Warnings

### WR-01: Background mutation of @Observable property via GCD instead of Task { @MainActor in }

**File:** `GooseSwift/HealthDataStore+Recovery.swift:90-93, 129-131, 133-135`

**Issue:** `HealthDataStore` is declared `@MainActor @Observable`. The extension uses `DispatchQueue.main.async { [weak self] in self?.recoveryV1Result = … }` to publish results from the `packetInputQueue` background thread. The rest of `HealthDataStore.swift` uses `Task { @MainActor in }` for mutations from background contexts (lines 87 and 156 in `HealthDataStore.swift`).

In Swift 6 strict concurrency mode, mutating an `@Observable @MainActor` property from a GCD closure is not actor-isolated — the closure runs on the main *queue* but is not tracked by the Swift actor system. This is a latent concurrency correctness issue that will surface as a warning or error with stricter checking and is inconsistent with the established project pattern.

**Fix:**
```swift
// Replace DispatchQueue.main.async with:
Task { @MainActor [weak self] in
  self?.recoveryV1Result = nil
}
// and:
Task { @MainActor [weak self] in
  self?.recoveryV1Result = result
}
```

Apply the same fix to the three `DispatchQueue.main.async` call sites inside `runRecoveryV1()`.

---

### WR-02: `goose_recovery_v1` not registered in algorithm catalog or default preferences

**File:** `Rust/core/src/metrics.rs:520-529, 531-538`

**Issue:** `built_in_algorithm_definitions()` registers only `recovery_definition()` (v0). `GOOSE_RECOVERY_V1_ID` has no corresponding `recovery_v1_definition()` entry and is not listed. Similarly, `built_in_default_algorithm_preferences()` still maps the `"recovery"` family to `GOOSE_RECOVERY_V0_ID` / `GOOSE_RECOVERY_V0_VERSION`.

Any code that selects an algorithm via the preference table (catalog resolution) will never reach `goose_recovery_v1`. The bridge dispatch works because the Swift side calls `metrics.goose_recovery_v1` directly by name — bypassing preference resolution — but the omission means the catalog is inconsistent with the deployed implementation and may confuse future algorithm-selection logic or debugging tooling.

**Fix:**
```rust
// Add to built_in_algorithm_definitions():
recovery_v1_definition(),

// Add recovery_v1_definition() function following the pattern of sleep_v1_definition()

// Optionally update built_in_default_algorithm_preferences() to prefer v1:
default_algorithm_preference("recovery", GOOSE_RECOVERY_V1_ID, GOOSE_RECOVERY_V1_VERSION),
```

---

## Info

### IN-01: `recoveryV1TrustLabel` does not handle the "trusted" case explicitly

**File:** `GooseSwift/HealthDataStore+Recovery.swift:45-49`

**Issue:** The `recoveryV1TrustLabel` switch handles `"calibrating"` and `"provisional"`, then falls to `default: return nil`. The `"trusted"` trust level is handled by the default arm implicitly. The intent (no badge when trusted) is correct per design, but the implicit fall-through makes the intent invisible to future maintainers and could silently hide a bug if a new trust level string is introduced.

**Fix:**
```swift
switch recoveryV1Result?.trustLevel {
case "calibrating": return "A calibrar"
case "provisional": return "Provisório"
case "trusted":     return nil      // explicit: trusted users see no badge
default:            return nil
}
```

---

_Reviewed: 2026-06-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
