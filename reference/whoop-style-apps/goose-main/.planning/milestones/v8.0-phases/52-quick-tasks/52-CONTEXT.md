# Phase 52: Quick Tasks & Surface Cleanup — Context

## Auto-Discovery Results

**QT-02 (CodeQL):** ALREADY DONE — .github/workflows/codeql.yml exists, runs on push/PR to main,
covers Swift + Python, uses GOOSE_SKIP_RUST_CORE_BUILD=1 skip flag.

**QT-03 (HealthKit importer):** ALREADY DONE — MoreView.swift has the button (Section "Apple Health"),
HealthKitFullImporter.importAll() is fully implemented, importAllFromHealthKit() wires result into 
HealthDataStore. The user can trigger it from More tab.

**QT-01 (BT button → settings):** NEEDS FIX
- DeviceView.swift:489 "Bluetooth" button calls ble.requestBluetooth() which only initializes CBCentralManager
- Should instead open iOS Bluetooth Settings via URL scheme

**SURF-01 (previewMissingData #if DEBUG):** NEEDS FIX
- HealthDataStore.swift:44 — `var previewMissingData = false` — no #if DEBUG guard
- Used in +Snapshots, +Trends, +StressEnergy, +Cardio
- In production builds, must always be false

## Plan

### QT-01: BT button
Change DeviceView.swift "Bluetooth" button action from `ble.requestBluetooth()` to:
```swift
UIApplication.shared.open(URL(string: UIApplication.openSettingsURLString)!)
```
Note: `App-Prefs:root=Bluetooth` opens Bluetooth directly but is undocumented.
iOS 18 provides `UIApplication.openBluetoothSettingsURLString` — use with availability check.

### SURF-01: previewMissingData
Wrap the property declaration with `#if DEBUG / #else / #endif`:
```swift
#if DEBUG
var previewMissingData = false
#else
let previewMissingData = false
#endif
```
No changes needed to call sites — the constant false is optimized away by the compiler.
