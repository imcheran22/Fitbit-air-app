# Phase 14: pt-PT Localisation — Research

**Researched:** 2026-06-05
**Domain:** iOS Localisation — Xcode String Catalog (.xcstrings), SwiftUI Text() resolution, dynamic status string extension pattern
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01: Scope — All screens (comprehensive)**
All user-visible `Text("...")`, `navigationTitle("...")`, `Label("...")`, `.accessibilityLabel("...")`, tab titles, button labels, and sheet titles across all screens — including Home, Health, Recovery, Sleep, Strain, More, Debug, Raw Export, Coach, Connection, Onboarding.

Excluded by design:
- Raw BLE/state values stored internally (`"ready"`, `"disconnected"` etc.) — logical constants, stay in English
- `record(source:title:body:)` log entries
- `print()` / `Logger` calls

**D-02: Static strings — Xcode String Catalog (Localizable.xcstrings)**
Create `GooseSwift/Localizable.xcstrings` as the single source of truth. Add `pt-PT` locale to the Xcode project. SwiftUI `Text("Key")` automatically resolves against the catalog — no code changes needed when key == English string.

Naming convention: use the English string as the key (default SwiftUI behaviour). Explicit key overrides for same-English/different-Portuguese contexts.

**D-03: Dynamic status strings — display-layer extension**
Do NOT change `@Published` state machine properties. Create `GooseSwift/LocalizedStatusStrings.swift` with `extension String` methods (`localizedConnectionState`, `localizedHRConnectionState`, etc.). Views replace `ble.connectionState` with `ble.connectionState.localizedConnectionState`.

**D-04: Scope of dynamic string coverage**
- `GooseBLEClient`: `connectionState`, `hrConnectionState`, `bluetoothState`, `hrBluetoothState`, `reconnectState`, `hrReconnectState`, `historicalSyncStatus`, `strapClockStatus`, `batteryPowerStatus`
- `GooseAppModel`: `healthPacketCaptureStatus`, `healthPacketCaptureTargetSummary`, `overnightGuardStatus`, `activityDetectionStatus`, `packetImportStatus`
- Upload/server: upload status strings displayed in More tab

**D-05: Wave structure (suggested)**
- Wave 1: Localizable.xcstrings + pt-PT locale + tab names, nav titles, Home/Health/Recovery screens
- Wave 2: More tab, Connection/Device, Onboarding, Coach
- Wave 3: Dynamic status strings (LocalizedStatusStrings.swift) + all @Published display sites
- Wave 4: Debug/Developer/Raw Export + final sweep

### Claude's Discretion
Not specified in CONTEXT.md.

### Deferred Ideas (OUT OF SCOPE)
Not specified in CONTEXT.md.
</user_constraints>

---

## Summary

The GooseSwift app has **zero localisation infrastructure** today — no `.lproj` directories, no `.strings` files, no `.xcstrings` file, and no calls to `String(localized:)` or `NSLocalizedString`. All UI text is written as raw English string literals in `Text("...")`, `navigationTitle("...")`, `Section("...")`, and `Button("...")` calls.

The scope is substantial: **36 Swift files** contain `Text("...")` calls, with **~190 `Text()` literal occurrences** and an additional ~300 strings spread across `Section()`, `Button()`, `Label()`, `LabeledContent()`, `.navigationTitle()`, and `.accessibilityLabel()` calls — approximately **480 UI string instances** across 43 view files. The tab title strings (`"Home"`, `"Health"`, `"Coach"`, `"More"`) live in a switch expression on `GooseAppTab.title` rather than in a view, requiring a small code change.

The `.xcstrings` String Catalog format (introduced with Xcode 15, supports iOS 16+) is the correct modern standard. It is JSON-based, and SwiftUI `Text("literal")` automatically resolves against `Localizable.xcstrings` because the `Text` initializer accepts `LocalizedStringKey`, not `String` — this means the majority of static strings require **no code changes**, only entries in the catalog. The primary code change needed is for `GooseAppTab.title` (a `String`-returning switch, not a `Text()` call) and for dynamic `@Published` status strings.

**Primary recommendation:** Create `Localizable.xcstrings` with `sourceLanguage: "en"` and add `"pt-PT"` to `knownRegions` in `project.pbxproj`. Build the catalog file-by-file across the four waves defined in D-05. Separately create `LocalizedStatusStrings.swift` for the ~14 dynamic `@Published` string properties.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Static UI text localisation | iOS app (SwiftUI) | Xcode build toolchain | Text() resolution is a runtime + build-time concern handled entirely on device |
| Dynamic status string mapping | iOS app (Swift extension) | — | Status strings originate in BLE/app layer; display conversion belongs in the view-adjacent extension |
| String Catalog file | Xcode project resource | — | .xcstrings is a build-time resource compiled into per-language .strings by Xcode |
| Locale registration | Xcode project (pbxproj) | — | knownRegions in project.pbxproj controls what locales are compiled into the bundle |
| State machine guards | Rust core + GooseBLEClient | — | Internal English values must NOT be changed; they are protocol constants |

---

## Current State Audit

### Localisation Infrastructure: NONE

| Item | Exists | Notes |
|------|--------|-------|
| `*.lproj` directories | No | Verified: `find GooseSwift -name "*.lproj"` returned empty |
| `Localizable.strings` | No | No `.strings` files anywhere in the project |
| `Localizable.xcstrings` | No | Does not exist |
| `knownRegions` in pbxproj | `en`, `Base` only | Line 684–687 of `GooseSwift.xcodeproj/project.pbxproj` |
| `developmentRegion` in pbxproj | `en` | Line 682 |
| `String(localized:)` calls | 0 | `grep -rn 'String(localized:'` returns 0 results |
| `NSLocalizedString` calls | 0 | No uses in codebase |
| `LocalizedStringKey` calls | 0 | No explicit uses |

### String Pattern: Raw English Literals

The 100% current pattern is:
```swift
Text("Connect")                          // SwiftUI literal — will auto-localise once xcstrings exists
navigationTitle("More")                  // Modifier literal — will auto-localise
Section("Status") { ... }               // Section header — will auto-localise
Button("Forget Remembered Device", ...) // Button label — will auto-localise
```

No code changes are required for the `Text("...")` / `navigationTitle("...")` / `Section("...")` / `Button("...")` / `Label("...")` patterns — SwiftUI's `Text` initializer accepts `LocalizedStringKey` by default, so once `Localizable.xcstrings` exists with the matching English key, resolution is automatic.

**Exception — `GooseAppTab.title`:** This property returns a `String`, not a `LocalizedStringKey`. The string is then passed via `Label(tab.title, systemImage:)`. Because `Label` also accepts `LocalizedStringKey` as its title, the fix is to change the `var title: String` to `var title: LocalizedStringKey` (or use `String(localized:)` in the return).

---

## String Inventory

Total approximate scope by UI call type (excluding comments and log calls):

| Call Type | Count | Notes |
|-----------|-------|-------|
| `Text("...")` | ~191 | Direct text renders |
| `.navigationTitle("...")` | ~40 | Screen titles |
| `Section("...")` | ~75 | List section headers |
| `Button("...")` | ~30 | Button labels |
| `Label("...")` | ~108 | Labels with system images |
| `.accessibilityLabel("...")` | ~23 | Accessibility text |
| `LabeledContent("...")` | ~11 | Key-value rows |
| **Total** | **~478** | |

### Per-File Inventory (top UI string files)

| File | UI String Count | Sample Strings |
|------|----------------|----------------|
| `HealthDataStore+CoachSummaries.swift` | 86 | Coach metric summaries (dynamic strings) |
| `HealthSleepSheetsViews.swift` | 58 | "Tonight's sleep needed", "Sleep Needed", "Sleep Alarm", "Save to Band", "Target amount" |
| `HealthMetricFamilyStrainViews.swift` | 51 | Strain metric labels |
| `HealthSupplementalViews.swift` | 43 | "Energy Bank", "Algorithms", "References", "Calibration", "Run Reference Comparisons" |
| `HealthCardioViews.swift` | 43 | "Cardio Load", "No Cardio Load", "Cardio Status Breakdown", "Pick Date" |
| `HealthRecoveryStressViews.swift` | 41 | "Recovery", "Stress" |
| `HealthDataStore+Utilities.swift` | 41 | Utility/computed display strings |
| `HealthDataStore+Snapshots.swift` | 37 | Snapshot display strings |
| `ConnectionView.swift` | 27 | "Status", "Actions", "Discovered", "Bluetooth", "Connection", "Reconnect", "Request Bluetooth", "Scan", "Stop Scan", "Connect Selected", "Reconnect Remembered", "No devices yet", "Sync Error", "Done", "Connect" |
| `SleepV2BevelTrendViews.swift` | 26 | Sleep trend labels |
| `HealthDashboardViews.swift` | 25 | "Health Monitor", "Packet Inputs" |
| `DeviceView.swift` | 25 | "Device", "Connection", "Historical sync" |
| `MoreProfileViews.swift` | 23 | "Profile", "Developer" |
| `HRMonitorView.swift` | 20 | "HR Monitor", "CONNECTED", "CONNECTING", "SCANNING", "BLUETOOTH OFF", "NOT AUTHORISED", "DISCOVERED", "HEART RATE", "BPM", "Disconnect" |
| `FitnessControlViews.swift` | 20 | "Workout" and fitness labels |
| `OnboardingStepViews.swift` | 22 | "Search again", "Back", "Connect your WHOOP", units labels |
| `MoreRemoteServerViews.swift` | 14 | "Remote Server", "Server", "Authentication", "Upload", "Checking...", "Server reachable", "Server unreachable", "Save", "Now" |
| `MoreCaptureViews.swift` | 25 | "Session", "Start Capture", "Stop Capture", "Overnight Guard", "Start Guard", "Stop Guard", "Final Sync" |
| `MoreDebugViews.swift` | 25 | "Debug", "Rust And Parser", "Run Parser Probe", "Debug Session", "Health Packet Capture" |
| `MoreRawExportViews.swift` | 21 | "Raw Export", "Algorithms", "Window", "Filters", "Data Families", "Export", "Save Local Data File" |
| `AppShellView.swift` | 0 (indirect) | Tab titles "Home", "Health", "Coach", "More" via `GooseAppTab.title` (String switch) |
| `MoreView.swift` | 9 | "More", "Device", "App", "Apple Health", "Settings", "Support", "Developer", "Import from Apple Health", "Update profile" |
| `RootView.swift` | 2 | "Sync Error", "Done" |

### GooseAppTab.title — Requires Code Change

```swift
// AppShellView.swift — current (not auto-localisable):
var title: String {
  switch self {
  case .home: "Home"
  case .health: "Health"
  case .coach: "Coach"
  case .more: "More"
  }
}

// Fix option 1 — change return type (cleanest):
var title: LocalizedStringKey {
  switch self {
  case .home: "Home"
  case .health: "Health"
  case .coach: "Coach"
  case .more: "More"
  }
}

// Fix option 2 — use String(localized:):
var title: String {
  switch self {
  case .home: String(localized: "Home")
  case .health: String(localized: "Health")
  case .coach: String(localized: "Coach")
  case .more: String(localized: "More")
  }
}
```

### MoreRouteModels.swift — Also Requires Code Change

Both `title: String` and `subtitle: String` on `MoreRoute` are String-returning computed properties fed into views. Same fix applies (change to `LocalizedStringKey` or use `String(localized:)`).

---

## Standard Stack

### Core (no external dependencies)

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `Localizable.xcstrings` | Xcode 15 / iOS 16+ format | Single source of truth for all static UI strings | Apple's current standard; replaces legacy `.strings`/`.stringsdict`; JSON-based, diffable in git |
| SwiftUI `Text("key")` resolution | iOS 16+ | Auto-resolves `LocalizedStringKey` against `Localizable.xcstrings` at runtime | Zero code changes for existing `Text("...")` calls |
| `String(localized: "key")` | iOS 15.4+ / Swift 5.5+ | For contexts where a `String` (not `LocalizedStringKey`) is needed | Correct API for `GooseAppTab.title` and `MoreRoute.title` |
| `extension String { var localizedXxx }` | Swift | Display-layer mapping for dynamic `@Published` status strings | Keeps state machine values in English; translates at view boundary only |

**No new package dependencies.** All localisation work uses Xcode's built-in toolchain.

### Xcode Project Changes Required

| Change | File | What |
|--------|------|------|
| Add `"pt-PT"` to `knownRegions` | `GooseSwift.xcodeproj/project.pbxproj` | Tells Xcode to compile pt-PT strings into the bundle |
| Add `Localizable.xcstrings` to Resources build phase | `project.pbxproj` | Registers catalog as project resource |
| Create `GooseSwift/Localizable.xcstrings` | New file | String catalog with all static translations |
| Create `GooseSwift/LocalizedStatusStrings.swift` | New file | Extension methods for dynamic status strings |

---

## Architecture Patterns

### Pattern 1: Xcode String Catalog Format (.xcstrings)

**What:** UTF-8 JSON file consumed by Xcode at build time. Xcode compiles it to per-language `.strings` files placed in the app bundle (e.g., `GooseSwift.app/pt-PT.lproj/Localizable.strings`). The runtime never sees `.xcstrings` directly.

**Structure:**
```json
{
  "sourceLanguage" : "en",
  "version" : "1.0",
  "strings" : {
    "Connect" : {
      "localizations" : {
        "pt-PT" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Ligar"
          }
        }
      }
    },
    "Reconnection failed after 10 attempts. Tap \"Try Again\" to restart." : {
      "localizations" : {
        "pt-PT" : {
          "stringUnit" : {
            "state" : "translated",
            "value" : "Reconexão falhou após 10 tentativas. Toque em \"Tentar novamente\" para recomeçar."
          }
        }
      }
    }
  }
}
```

**Key:** For strings with SwiftUI interpolation like `Text("Gen \(device.generation)")`, the key in the catalog uses `%@` positional placeholders:
```json
"Gen %@ · %@ dBm" : {
  "localizations" : {
    "pt-PT" : {
      "stringUnit" : { "state" : "translated", "value" : "Gen %1$@ · %2$@ dBm" }
    }
  }
}
```
[CITED: developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog]

### Pattern 2: Adding pt-PT to project.pbxproj

The `knownRegions` array in `PBXProject` (line 684 in `GooseSwift.xcodeproj/project.pbxproj`) must include `"pt-PT"`:

```
knownRegions = (
  en,
  Base,
  "pt-PT",
);
```

No `developmentRegion` change needed — it stays `en`.

### Pattern 3: LocalizedStatusStrings.swift

**What:** Swift extension on `String` that maps raw English state machine values to pt-PT display strings. Views call `.localizedConnectionState` instead of using the raw value directly.

**When to use:** Any `@Published var ... String` on `GooseBLEClient` or `GooseAppModel` that is displayed in a view (not used in a `guard`, `if`, `switch`, or `==` comparison).

**Example:**
```swift
// GooseSwift/LocalizedStatusStrings.swift
extension String {
  var localizedConnectionState: String {
    switch self {
    case "disconnected": return String(localized: "Desligado")
    case "connecting":   return String(localized: "A ligar...")
    case "connected":    return String(localized: "Ligado")
    case "discovering":  return String(localized: "A descobrir...")
    case "ready":        return String(localized: "Pronto")
    default:             return self  // Unknown states fall back to English
    }
  }

  var localizedBluetoothState: String {
    switch self {
    case "not requested":  return String(localized: "Não pedido")
    case "poweredOn":      return String(localized: "Ativo")
    case "poweredOff":     return String(localized: "Desligado")
    case "unauthorized":   return String(localized: "Sem autorização")
    case "unsupported":    return String(localized: "Não suportado")
    default:               return self
    }
  }

  // ... localizedHRConnectionState, localizedReconnectState, etc.
}
```

**View usage:**
```swift
// Before:
LabeledContent("Bluetooth", value: ble.bluetoothState)

// After:
LabeledContent("Bluetooth", value: ble.bluetoothState.localizedBluetoothState)
```

[ASSUMED — pattern derived from CONTEXT.md D-03; implementation detail is design decision]

### Pattern 4: String(localized:) for String-returning properties

For `GooseAppTab.title`, `MoreRoute.title`, and `MoreRoute.subtitle` (computed `String` properties):

```swift
// Option A — change return type to LocalizedStringKey (preferred for SwiftUI)
var title: LocalizedStringKey {
  switch self {
  case .home: "Home"          // "Home" is now a LocalizedStringKey
  case .health: "Health"
  case .coach: "Coach"
  case .more: "More"
  }
}

// Option B — String(localized:) when callers need String
var title: String {
  switch self {
  case .home: String(localized: "Home")
  case .more: String(localized: "More")
  // ...
  }
}
```

`Label(tab.title, systemImage:)` accepts `LocalizedStringKey` — Option A is the cleanest approach.
[CITED: developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog]

---

## Dynamic Status String Inventory (D-04)

The following `@Published` String properties on `GooseBLEClient` and `GooseAppModel` are displayed to the user and need `.localizedXxx` extension methods:

### GooseBLEClient (from `GooseBLEClient.swift` lines 7–74)

| Property | Default Value | Display Sites | Extension Method |
|----------|--------------|--------------|-----------------|
| `bluetoothState` | `"not requested"` | `ConnectionView` (LabeledContent), `OnboardingStepViews` | `.localizedBluetoothState` |
| `connectionState` | `"disconnected"` | `ConnectionView`, `OnboardingStepViews` (detail), `HomeDashboardView`, `DeviceView` | `.localizedConnectionState` |
| `reconnectState` | `"idle"` | `ConnectionView` (LabeledContent) | `.localizedReconnectState` |
| `hrReconnectState` | `"idle"` | `ConnectionView` (LabeledContent), `HRMonitorView` (Text) | `.localizedHRReconnectState` |
| `hrConnectionState` | `"disconnected"` | `HRMonitorView` (switch for status text) | `.localizedHRConnectionState` |
| `hrBluetoothState` | `"unknown"` | `HRMonitorView` (switch for status text) | `.localizedHRBluetoothState` |
| `historicalSyncStatus` | `"idle"` | `ConnectionView` (computed), `SleepV2ScheduleViews`, `SleepBridgeViews`, `DeviceView` | `.localizedHistoricalSyncStatus` |
| `batteryPowerStatus` | `"Unknown"` | DeviceView | `.localizedBatteryPowerStatus` |
| `strapClockStatus` | `"Not read"` | DeviceView/MoreDebugViews | `.localizedStrapClockStatus` |

### GooseAppModel (from `GooseAppModel.swift` lines 7–45)

| Property | Default Value | Display Sites | Extension Method |
|----------|--------------|--------------|-----------------|
| `healthPacketCaptureStatus` | `"No health packet capture"` | MoreCaptureViews | `.localizedCaptureStatus` |
| `healthPacketCaptureTargetSummary` | `"No health packet capture"` | MoreCaptureViews | `.localizedCaptureTargetSummary` |
| `overnightGuardStatus` | `"Not started"` | MoreCaptureViews | `.localizedOvernightGuardStatus` |
| `activityDetectionStatus` | `"Watching for movement packets"` | MoreDebugViews/HomeDashboard | `.localizedActivityDetectionStatus` |
| `packetImportStatus` | `"No packet import"` | Debug/Capture views | `.localizedPacketImportStatus` |

### Notes on HRMonitorView (special case)

`HRMonitorView` uses raw string guards AND hardcoded UI strings for status display:
```swift
// Line 67-99: status text rendered directly as string literals
case "connected": HRMonitorHeader(statusText: "CONNECTED", ...)
```
These hardcoded status display strings (`"CONNECTED"`, `"CONNECTING"`, `"SCANNING"`, `"BLUETOOTH OFF"`, `"NOT AUTHORISED"`) are NOT from `@Published` properties — they are display-layer constants embedded in the view. These go into `Localizable.xcstrings` directly as static keys.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-language .strings files | Manual `.strings` file editing | `.xcstrings` JSON catalog | xcstrings handles plural rules, device variants, and missing translation fallback automatically |
| Custom localisation lookup at runtime | `UserDefaults`-based language override | iOS `Bundle` + `knownRegions` | The OS locale system handles this; custom overrides bypass accessibility settings |
| Translation memory / sync | Custom tooling | Xcode's built-in string extraction | Xcode 15 can auto-extract `Text()` literals into the catalog via Editor > Export Localizations |
| Emoji/icon variants per locale | Custom branching | `.xcstrings` `device` variations | Built into the format |

---

## Common Pitfalls

### Pitfall 1: `String`-returning property bypasses auto-localisation

**What goes wrong:** `Label(tab.title, ...)` where `tab.title: String` — the `Label` initializer sees a `String`, not a `LocalizedStringKey`, and does not look up the catalog.

**Why it happens:** Swift's type system distinguishes `String` from `LocalizedStringKey`. `Text("literal")` passes a `LocalizedStringKey` because string literals conform to `LocalizedStringKey.ExpressibleByStringLiteral`. But once a string literal is stored in a `var: String`, it's just a `String`.

**How to avoid:** Change `var title: String` to `var title: LocalizedStringKey` on `GooseAppTab` and `MoreRoute`. Or use `String(localized: ...)` in the computed property body.

**Warning signs:** String displayed in view looks the same in en and pt-PT.

### Pitfall 2: State machine guards break if `@Published` values are changed

**What goes wrong:** Views use `ble.connectionState == "ready"` as a guard. If the raw value is changed to a localised string, these guards break silently.

**Why it happens:** Temptation to localise the stored value instead of the display value.

**How to avoid:** Follow D-03 strictly. The raw `@Published` values must remain English. Only the display extension methods translate them.

**Warning signs:** Buttons disabled/enabled incorrectly, conditional view rendering breaks.

### Pitfall 3: Interpolated strings need explicit catalog entries

**What goes wrong:** `Text("Gen \(device.generation)")` — SwiftUI creates a `LocalizedStringKey` with format arguments, but the key in the catalog must match exactly including the `%@` substitution pattern.

**Why it happens:** The catalog key is `"Gen %@"`, not `"Gen \(device.generation)"`. Xcode auto-generates these during Export Localizations, but when writing the catalog manually, the format specifier must be used.

**How to avoid:** For strings with interpolation, write the key with `%@` / `%lld` / `%d` placeholders. For complex pluralisation (`"1 packet"` vs `"N packets"`), use the `variations.plural` structure in the catalog.

**Warning signs:** String renders in English on a pt-PT device despite catalog entry existing.

### Pitfall 4: `HealthDataStore+CoachSummaries.swift` produces `String` display output

**What goes wrong:** Many computed display strings (used in Coach AI context) are built using string interpolation in `HealthDataStore+CoachSummaries.swift`. These are `String`-returning methods, not `Text()` calls.

**Why it happens:** The Coach summary strings feed into the AI prompt context, not directly into SwiftUI `Text()`. They may or may not be user-visible.

**How to avoid:** Audit whether coach summary strings appear in user-visible `Text()` views. If they feed only into AI prompts (not UI labels), they are out of scope per D-01 (internal data).

**Warning signs:** Confusing coach string output language with UI label language.

### Pitfall 5: `Text(verbatim:)` disables localisation

**What goes wrong:** Using `Text(verbatim: "...")` suppresses catalog lookup — the string always renders as-is.

**How to avoid:** Only use `Text(verbatim:)` for truly non-localised content (e.g., hex dumps, log data, BLE frame bytes).

---

## Code Examples

### Minimal Localizable.xcstrings (Wave 1 seed)

```json
{
  "sourceLanguage" : "en",
  "version" : "1.0",
  "strings" : {
    "Home" : {
      "localizations" : {
        "pt-PT" : {
          "stringUnit" : { "state" : "translated", "value" : "Início" }
        }
      }
    },
    "Health" : {
      "localizations" : {
        "pt-PT" : {
          "stringUnit" : { "state" : "translated", "value" : "Saúde" }
        }
      }
    },
    "Coach" : {
      "localizations" : {
        "pt-PT" : {
          "stringUnit" : { "state" : "translated", "value" : "Treinador" }
        }
      }
    },
    "More" : {
      "localizations" : {
        "pt-PT" : {
          "stringUnit" : { "state" : "translated", "value" : "Mais" }
        }
      }
    },
    "Today" : {
      "localizations" : {
        "pt-PT" : {
          "stringUnit" : { "state" : "translated", "value" : "Hoje" }
        }
      }
    },
    "Connect" : {
      "localizations" : {
        "pt-PT" : {
          "stringUnit" : { "state" : "translated", "value" : "Ligar" }
        }
      }
    }
  }
}
```

### pbxproj knownRegions addition

```
knownRegions = (
  en,
  Base,
  "pt-PT",
);
```

### LocalizedStatusStrings.swift skeleton

```swift
// GooseSwift/LocalizedStatusStrings.swift
import Foundation

extension String {

  /// Maps BLE connection state raw values to pt-PT display strings.
  /// Raw values ("connected", "ready", etc.) are preserved unchanged as internal constants.
  var localizedConnectionState: String {
    switch self {
    case "disconnected":  return String(localized: "Desligado")
    case "connecting":    return String(localized: "A ligar...")
    case "discovering":   return String(localized: "A descobrir...")
    case "connected":     return String(localized: "Ligado")
    case "ready":         return String(localized: "Pronto")
    default:              return self
    }
  }

  var localizedBluetoothState: String {
    switch self {
    case "not requested": return String(localized: "Não pedido")
    case "poweredOn":     return String(localized: "Ativo")
    case "poweredOff":    return String(localized: "Desligado")
    case "unauthorized":  return String(localized: "Sem autorização")
    case "unsupported":   return String(localized: "Não suportado")
    case "unknown":       return String(localized: "Desconhecido")
    default:              return self
    }
  }

  var localizedHRConnectionState: String {
    switch self {
    case "disconnected":  return String(localized: "Desligado")
    case "connecting":    return String(localized: "A ligar...")
    case "connected":     return String(localized: "Ligado")
    default:              return self
    }
  }

  var localizedReconnectState: String {
    guard self != "idle" else { return String(localized: "Inativo") }
    if hasPrefix("reconnecting") {
      return String(localized: "A reconectar...")
    }
    if hasPrefix("failed") {
      return String(localized: "Falhou")
    }
    return self
  }
}
```

---

## Xcstrings Format — Key Facts

[CITED: developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog]

| Property | Value |
|----------|-------|
| File format | UTF-8 JSON |
| Extension | `.xcstrings` |
| Introduced | Xcode 15 (WWDC 2023) |
| Minimum iOS deployment | iOS 16 |
| Source language field | `"sourceLanguage": "en"` |
| Version field | `"version": "1.0"` |
| Locale code for European Portuguese | `"pt-PT"` |
| SwiftUI auto-resolution | Yes — `Text("literal")` uses `LocalizedStringKey` automatically |
| Build output | Compiled to `.strings` files per locale in the app bundle |
| String state values | `"new"`, `"translated"`, `"needs_review"` |
| Pluralisation | `variations.plural.one` / `variations.plural.other` |
| Interpolated string key | Uses `%@` / `%lld` / `%d` not Swift `\(...)` syntax |

**This format is fully compatible with iOS 26.0 (the project's deployment target).** [CITED: developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Xcode UI snapshot / manual device locale test |
| Config file | none (no Swift test target with UI tests detected) |
| Quick check | Switch device language to "Português (Portugal)" in iOS Settings → Geral → Idioma |
| Full check | Navigate every tab: Home, Health, Coach, More, Connection, HR Monitor |

Note: `nyquist_validation` is enabled in `.planning/config.json`. There is no automated Swift/XCTest UI test infrastructure detected in this project (only Rust `cargo test` integration tests). Automated localisation validation is therefore **manual** for this phase.

### Phase Requirements → Test Map

| Req ID | Behaviour | Test Type | Automated Command | File Exists? |
|--------|-----------|-----------|-------------------|-------------|
| LOC-01 | Tab bar shows pt-PT titles when device is Portuguese | Manual | — (device locale test) | n/a |
| LOC-02 | NavigationTitle strings display in pt-PT | Manual | — | n/a |
| LOC-03 | Section headers, buttons, labels display in pt-PT | Manual | — | n/a |
| LOC-04 | Dynamic status strings display in pt-PT via extension | Manual | — | n/a |
| LOC-05 | State machine guards (connectionState == "ready") still work | Compile + run | n/a | n/a |
| LOC-06 | `Localizable.xcstrings` is well-formed JSON | `python3 -m json.tool GooseSwift/Localizable.xcstrings` | ❌ Wave 0 (file doesn't exist yet) |

### Wave 0 Gaps

- [ ] `GooseSwift/Localizable.xcstrings` — must be created (Wave 1 task)
- [ ] `GooseSwift/LocalizedStatusStrings.swift` — must be created (Wave 3 task)
- JSON lint command (no test framework required): `python3 -m json.tool GooseSwift/Localizable.xcstrings > /dev/null && echo "valid"`

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Xcode 15+ | `.xcstrings` format support | Assumed ✓ | Unknown (iOS 26 SDK implies Xcode 16+) | — |
| Python 3 | JSON lint of `.xcstrings` | ✓ | System Python 3 | `jq` or manual inspection |
| iOS 26 simulator or device | Manual localisation testing | Assumed ✓ | — | — |

---

## Security Domain

The security domain is not applicable to this phase. This phase introduces no new data handling, network calls, authentication, or cryptographic operations. All changes are UI text substitution only.

`security_enforcement` is enabled in config, but no ASVS categories apply to string localisation.

---

## Open Questions

1. **Translation authority**
   - What we know: CONTEXT.md commits to pt-PT but provides no translation strings
   - What's unclear: Who provides the Portuguese translations? Is the developer bilingual for all ~480 strings?
   - Recommendation: Generate English keys in xcstrings during Wave 1–4; fill translations iteratively. Mark untranslated entries with `"state": "new"` until confirmed.

2. **Coach AI context strings (HealthDataStore+CoachSummaries.swift)**
   - What we know: This file produces string output that feeds into AI coach prompts — 86 string-bearing lines
   - What's unclear: Are any of these strings rendered directly in SwiftUI `Text()` views, or only in the AI prompt context?
   - Recommendation: Audit the callers of each `HealthDataStore+CoachSummaries.swift` method before Wave 1 to determine if they are in scope.

3. **MoreRoute.subtitle display**
   - What we know: `MoreRoute.subtitle: String` returns English subtitles (e.g., `"Name, birthday, height, weight, and profile basics"`)
   - What's unclear: Are subtitles rendered in visible UI (section footers, tooltips) or only internally?
   - Recommendation: Check `MoreInfoViews.swift` and `MoreRouteRow` for subtitle display sites during Wave 2.

4. **GooseSyncToast.title (dynamic)**
   - What we know: Toast titles are set dynamically in `GooseBLEClient+HistoricalHandlers.swift` line 718
   - What's unclear: What is the full set of possible toast title strings?
   - Recommendation: `grep -n 'GooseSyncToast(' GooseSwift/` to enumerate all construction sites; include titles in `LocalizedStatusStrings.swift` or as static catalog keys.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Xcode version in use supports `.xcstrings` (requires Xcode 15+) | Standard Stack | Phase cannot proceed without Xcode 15+; unlikely given iOS 26 SDK is used |
| A2 | `LocalizedStatusStrings.swift` extension pattern (D-03) produces correct ptPT strings at display sites | Pattern 3 | Status strings remain in English; Wave 3 testing catches this |
| A3 | `HealthDataStore+CoachSummaries.swift` strings feed AI prompts only, not user-visible `Text()` | String Inventory | If wrong, ~86 additional strings enter scope |
| A4 | `GooseAppTab.title: LocalizedStringKey` change is safe — no caller requires `String` type | Pattern 4 | Compile error if a caller requires `String`; easily caught at build time |

---

## Sources

### Primary (HIGH confidence)
- [developer.apple.com — Localizing and Varying Text with a String Catalog](https://developer.apple.com/documentation/xcode/localizing-and-varying-text-with-a-string-catalog) — format specification, iOS version, SwiftUI Text() resolution, xcstrings JSON schema
- `GooseSwift.xcodeproj/project.pbxproj` lines 682–687 — verified: only `en` and `Base` in `knownRegions`; `developmentRegion = en`
- `GooseSwift/GooseBLEClient.swift` lines 1–74 — verified: all `@Published` String properties and their default values
- `GooseSwift/GooseAppModel.swift` lines 7–45 — verified: all `@Published` status String properties

### Secondary (MEDIUM confidence)
- Codebase grep: 0 results for `String(localized:)`, `NSLocalizedString`, `LocalizedStringKey` — confirms zero existing localisation infrastructure
- Codebase grep: 0 results for `.lproj`, `.strings` — confirms no existing locale bundles
- Per-file string counts via `grep` across 43 view files — approximately 478 total UI string instances

---

## Metadata

**Confidence breakdown:**
- Infrastructure current state: HIGH — verified by `find` and `grep` across codebase
- String counts: MEDIUM — grep counts include some false positives (Text() on dynamic values); exact count varies by ±10%
- xcstrings format: HIGH — verified against official Apple documentation
- Dynamic status string values: HIGH — read directly from `GooseBLEClient.swift` source
- Wave scoping: MEDIUM — D-05 from CONTEXT.md is "suggested"; actual wave split confirmed by locked decision

**Research date:** 2026-06-05
**Valid until:** 2026-07-05 (stable Apple localisation APIs; unlikely to change)
