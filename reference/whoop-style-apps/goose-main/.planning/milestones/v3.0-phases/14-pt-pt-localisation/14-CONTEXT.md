---
phase: 14
name: pt-PT Localisation
date: 2026-06-05
status: discussed
---

# Phase 14 Context — pt-PT Localisation

## Domain

Localise all user-visible text in the app to European Portuguese (pt-PT), using Xcode String Catalog (`Localizable.xcstrings`) for static strings and a dedicated display-layer extension for dynamic `@Published` status strings.

## Decisions

### D-01: Scope — All screens (comprehensive)

**Locked:** All user-visible `Text("...")`, `navigationTitle("...")`, `Label("...")`, `.accessibilityLabel("...")`, tab titles, button labels, and sheet titles across all screens — including Home, Health, Recovery, Sleep, Strain, More, Debug, Raw Export, Coach, Connection, Onboarding. Exclude: log/telemetry strings passed to `record(source:title:body:)`, internal state machine values, and test code.

**Excluded by design:**
- Raw BLE/state values stored internally (`"ready"`, `"disconnected"` etc.) — these stay in English as logical constants
- `record(source:title:body:)` log entries — internal telemetry, never shown in UI
- `print()` / `Logger` calls

### D-02: Static strings — Xcode String Catalog (Localizable.xcstrings)

**Locked:** Create `GooseSwift/Localizable.xcstrings` as the single source of truth for static UI text. Add `pt-PT` locale to the Xcode project (in `GooseSwift.xcodeproj/project.pbxproj`).

SwiftUI `Text("Key")` automatically looks up `Localizable.xcstrings` — no code changes needed when the key in code matches the English string. For strings that need explicit localisation calls, use `String(localized: "Key")` or `Text(LocalizedStringKey("Key"))`.

**Naming convention for keys:** Use the English string as the key (default SwiftUI behaviour). For strings that appear in multiple contexts with the same English text but different Portuguese translations, use explicit key overrides.

### D-03: Dynamic status strings — display-layer extension

**Locked:** Do NOT change `@Published var connectionState`, `hrConnectionState`, `bluetoothState`, `historicalSyncStatus`, `packetScoreStatus`, etc. These are state machine values that stay in English internally.

Create `GooseSwift/LocalizedStatusStrings.swift` with functions that convert raw status values to pt-PT display strings:

```swift
extension String {
  var localizedConnectionState: String { ... }
  var localizedHRConnectionState: String { ... }
  var localizedBluetoothState: String { ... }
  var localizedSyncStatus: String { ... }
  // etc.
}
```

Views that display these use `ble.connectionState.localizedConnectionState` instead of `ble.connectionState` directly. Values not in the map fall back to the raw English string (unknown states).

### D-04: Scope of dynamic string coverage

**Locked:** All `@Published` String/String? properties on `GooseBLEClient` and `GooseAppModel` that are displayed to the user in any View. Specifically:
- `GooseBLEClient`: `connectionState`, `hrConnectionState`, `bluetoothState`, `hrBluetoothState`, `reconnectState`, `hrReconnectState`, `historicalSyncStatus`, `strapClockStatus`, `batteryPowerStatus`
- `GooseAppModel`: `healthPacketCaptureStatus`, `healthPacketCaptureTargetSummary`, `overnightGuardStatus`, `activityDetectionStatus`, `packetImportStatus`
- Upload/server: upload status strings displayed in More tab

**Implementation:** Audit each display site, replace with `.localizedXxx` variant.

### D-05: Wave structure (suggested for planning)

Given the volume (~180+ strings), suggest splitting into waves:
- Wave 1: Create Localizable.xcstrings + add pt-PT locale to project + translate tab names, navigation titles, Home/Health/Recovery screens
- Wave 2: More tab, Connection/Device screens, Onboarding, Coach
- Wave 3: Dynamic status strings (LocalizedStatusStrings.swift) + all @Published display sites
- Wave 4: Debug/Developer/Raw Export screens + final sweep for missed strings

## Canonical Refs

- `GooseSwift/GooseSwift.xcodeproj/project.pbxproj` — add pt-PT to known regions and localizations
- `GooseSwift/Localizable.xcstrings` — new file to create
- `GooseSwift/LocalizedStatusStrings.swift` — new file for dynamic string extensions (D-03)
- `GooseSwift/AppShellView.swift` — tab titles (Home/Health/Coach/More)
- `GooseSwift/RootView.swift` — onboarding + sync error strings
- `GooseSwift/ConnectionView.swift` — BLE connection strings
- `GooseSwift/MoreView.swift` — More tab navigation strings
- Apple String Catalog format: https://developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog

## Success Criteria

1. `Localizable.xcstrings` exists with pt-PT translations for all static UI strings
2. When device language is Portuguese (Portugal), all static UI text renders in pt-PT
3. `LocalizedStatusStrings.swift` provides pt-PT display text for all `@Published` status strings
4. No hardcoded English text visible in main user-facing flows when device is set to pt-PT
5. State machine logic (guards on raw string values) is unaffected
