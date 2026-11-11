# Phase 10: HR Monitor Scan/Connect UI - Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 5 new/modified files
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `GooseSwift/HRMonitorView.swift` | component (view) | event-driven (BLE state) | `GooseSwift/DeviceView.swift` | exact |
| `GooseSwift/GooseBLEClient.swift` | model (ObservableObject) | event-driven | `GooseSwift/GooseBLEClient.swift` (existing `@Published` block) | exact |
| `GooseSwift/GooseBLEClient+HRMonitor.swift` | service (BLE) | event-driven | `GooseSwift/GooseBLEClient+HRMonitor.swift` (existing) | exact |
| `GooseSwift/MoreRouteModels.swift` | config/enum | CRUD | `GooseSwift/MoreRouteModels.swift` (existing enum) | exact |
| `GooseSwift/MoreView.swift` | component (view) | request-response | `GooseSwift/MoreView.swift` (existing `destination(for:)`) | exact |

---

## Pattern Assignments

### `GooseSwift/HRMonitorView.swift` (new file — component, event-driven)

**Analog:** `GooseSwift/DeviceView.swift`

**Imports pattern** (DeviceView.swift lines 1–2):
```swift
import SwiftUI
import UIKit
```

**Top-level view shell pattern** (DeviceView.swift lines 4–11):
```swift
struct DeviceView: View {
  @EnvironmentObject private var model: GooseAppModel

  var body: some View {
    DeviceContentView(ble: model.ble)
      .environmentObject(model)
  }
}
```
Copy exactly for `HRMonitorView` — replace `DeviceContentView` with `HRMonitorContentView`.

**Content view with @ObservedObject pattern** (DeviceView.swift lines 18–22):
```swift
private struct DeviceContentView: View {
  @EnvironmentObject private var model: GooseAppModel
  @EnvironmentObject private var packetMonitor: PacketMonitorModel
  @ObservedObject var ble: GooseBLEClient
  @State private var selectedPanel: DevicePanel = .status
```
For `HRMonitorContentView`, omit `packetMonitor` and replace `@State selectedPanel` with:
```swift
@State private var selectedDevice: GooseDiscoveredDevice?
@State private var connectingDeviceID: UUID?
```

**ZStack + ScrollView + VStack layout pattern** (DeviceView.swift lines 24–57):
```swift
var body: some View {
  ZStack {
    deviceScreenBackground.ignoresSafeArea()
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        // header
        // content
      }
      .padding(.horizontal, 22)
      .padding(.top, 36)
      .padding(.bottom, 28)
    }
  }
  .navigationTitle("Device")
  .navigationBarTitleDisplayMode(.inline)
  .toolbarBackground(.hidden, for: .navigationBar)
  .tint(devicePrimaryText)
```
Use identical structure. Replace `"Device"` with `"HR Monitor"`. No toolbar button needed.

**onAppear lifecycle pattern** (DeviceView.swift lines 71–74):
```swift
.onAppear {
  ble.refreshBatteryLevel()
  ble.refreshDeviceInformation()
}
```
For HR Monitor, replace with:
```swift
.onAppear {
  guard ble.hrConnectionState != "connected" else { return }
  ble.startHRMonitorScan()
}
.onDisappear {
  ble.stopHRMonitorScan()
}
```

**Header struct pattern** (DeviceView.swift lines 204–248):
```swift
private struct DeviceConnectionHeader: View {
  let connected: Bool
  let statusText: String
  let deviceName: String
  let lastSync: String
  let generation: String?

  var body: some View {
    HStack(alignment: .bottom, spacing: 16) {
      VStack(alignment: .leading, spacing: 7) {
        Text(statusText)
          .font(deviceLabelFont)
          .foregroundStyle(connected ? connectedGreen : disconnectedRed)
          .lineLimit(1)
        Text(deviceName.uppercased())
          .font(.system(size: 26, weight: .black, design: .default))
          .foregroundStyle(devicePrimaryText)
          .lineLimit(2)
          .minimumScaleFactor(0.78)
        // right VStack with LAST SYNC — OMIT for HRMonitorHeader
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}
```
`HRMonitorHeader` must be a NEW private struct in `HRMonitorView.swift` — do NOT reuse `DeviceConnectionHeader`. Omit the right-side `VStack` ("LAST SYNC") entirely.

**Scan list row pattern** (ConnectionView.swift lines 102–119):
```swift
ForEach(ble.discoveredDevices) { device in
  Button {
    ble.select(device)
  } label: {
    HStack {
      VStack(alignment: .leading) {
        Text(device.name)
        Text("Gen \(device.generation == "unknown" ? "?" : String(device.generation.prefix(1))) · \(device.rssi) dBm")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Spacer()
      Text("\(device.rssi)")
        .foregroundStyle(.secondary)
    }
  }
}
```
For `HRMonitorDeviceRow`, adapt to DeviceView visual style (no `.caption` + `.secondary`, use `deviceBodyFont` + `mutedText`) and add inline `ProgressView` when `isConnecting`:
```swift
HStack(spacing: 12) {
  VStack(alignment: .leading, spacing: 4) {
    Text(device.name)
      .font(deviceBodyFont.weight(.black))
      .foregroundStyle(devicePrimaryText)
    Text("\(device.rssi) dBm")
      .font(.system(size: 12, weight: .bold))
      .foregroundStyle(mutedText)
  }
  Spacer(minLength: 16)
  if isConnecting {
    ProgressView()
      .scaleEffect(0.8)
      .tint(secondaryText)
  }
}
.padding(.vertical, 12)
.contentShape(Rectangle())
```

**Sheet presentation pattern** — use `.sheet(item:)` so `selectedDevice = nil` auto-dismisses:
```swift
.sheet(item: $selectedDevice) { device in
  HRMonitorDeviceSheet(device: device) {
    connectingDeviceID = device.id
    selectedDevice = nil
    ble.connectHRMonitor(device)
  }
  .presentationDetents([.height(220)])
  .presentationDragIndicator(.visible)
}
```

**Color and font token pattern** (DeviceView.swift lines 671–702):
```swift
private let deviceScreenBackground = GooseTheme.appBackground
private let devicePrimaryText = Color(uiColor: .label)
private let controlBackground = Color(uiColor: UIColor { traits in
  traits.userInterfaceStyle == .dark
    ? UIColor(red: 0.12, green: 0.16, blue: 0.18, alpha: 1)
    : .secondarySystemGroupedBackground
})
private let dividerColor = Color(uiColor: UIColor { traits in
  traits.userInterfaceStyle == .dark
    ? UIColor(red: 0.19, green: 0.22, blue: 0.25, alpha: 1)
    : .separator
})
private let secondaryText = Color(uiColor: UIColor { traits in
  traits.userInterfaceStyle == .dark
    ? UIColor(red: 0.63, green: 0.65, blue: 0.67, alpha: 1)
    : .secondaryLabel
})
private let mutedText = Color(uiColor: UIColor { traits in
  traits.userInterfaceStyle == .dark
    ? UIColor(red: 0.56, green: 0.58, blue: 0.60, alpha: 1)
    : .tertiaryLabel
})
private let connectedGreen = Color(red: 0.42, green: 0.84, blue: 0.30)
private let disconnectedRed = Color(red: 1.0, green: 0.27, blue: 0.23)
private let deviceLabelFont = Font.system(size: 15, weight: .black, design: .default)
private let deviceBodyFont = Font.system(size: 17, weight: .bold, design: .default)
```
Copy these file-scope `private let` constants verbatim into `HRMonitorView.swift`. This is the established project convention — each file declares its own copies.

---

### `GooseSwift/GooseBLEClient.swift` (edit — add 2 `@Published` properties)

**Analog:** `GooseSwift/GooseBLEClient.swift` lines 7–36

**Existing `@Published` block pattern** (lines 7–36):
```swift
final class GooseBLEClient: NSObject, ObservableObject, @unchecked Sendable {
  @Published var bluetoothState = "not requested"
  @Published var connectionState = "disconnected"
  @Published var isScanning = false
  @Published var discoveredDevices: [GooseDiscoveredDevice] = []
  @Published var liveHeartRateBPM: Int?
  // ... (continues to line 36)
  @Published var hrReconnectState = "idle"      // line 24 — already exists
```

**New lines to add** — insert immediately after `hrReconnectState` (line 24), following the same pattern:
```swift
@Published var discoveredHRDevices: [GooseDiscoveredDevice] = []
@Published var hrConnectionState: String = "disconnected"
```

No other changes to this file.

---

### `GooseSwift/GooseBLEClient+HRMonitor.swift` (edit — 3 targeted changes)

**Analog:** `GooseSwift/GooseBLEClient+HRMonitor.swift` (full file, read above)

**Change 1 — Add "connecting" state in `connect(_:)`** (currently lines 93–99):
```swift
// BEFORE:
func connect(_ device: GooseDiscoveredDevice) {
  guard let peripheral = central?.retrievePeripherals(withIdentifiers: [device.id]).first else {
    return
  }
  connectedDeviceName = device.name
  central?.connect(peripheral, options: nil)
}

// AFTER:
func connect(_ device: GooseDiscoveredDevice) {
  guard let peripheral = central?.retrievePeripherals(withIdentifiers: [device.id]).first else {
    return
  }
  connectedDeviceName = device.name
  hrConnectionState = "connecting"
  DispatchQueue.main.async { [weak self] in
    self?.owner?.hrConnectionState = "connecting"
  }
  central?.connect(peripheral, options: nil)
}
```

**Change 2 — Mirror `discoveredHRDevices` to owner's `@Published`** (currently lines 141–143):
```swift
// BEFORE:
DispatchQueue.main.async { [weak self] in
  self?.owner?.objectWillChange.send()
}

// AFTER:
DispatchQueue.main.async { [weak self] in
  self?.owner?.discoveredHRDevices = self?.discoveredHRDevices ?? []
}
```

**Change 3 — Mirror `hrConnectionState` to owner's `@Published` in `didConnect` and `didDisconnect`** (lines 146–167):
```swift
// In didConnect — after hrConnectionState = "connected":
DispatchQueue.main.async { [weak self] in
  self?.owner?.hrConnectionState = "connected"
}

// In didDisconnect — after hrConnectionState = "disconnected":
DispatchQueue.main.async { [weak self] in
  self?.owner?.hrConnectionState = "disconnected"
}
```

**Change 4 — Add `disconnectHRMonitor()` to the `GooseBLEClient` extension** (after existing `connectHRMonitor` at line 229):
```swift
// Pattern: same structure as existing extension methods (lines 217–233)
func disconnectHRMonitor() {
  hrMonitorManager.stopScan()
  hrMonitorManager.hrStopReconnect()
  if let peripheral = hrMonitorManager.hrPeripheral {
    hrMonitorManager.central?.cancelPeripheralConnection(peripheral)
  }
  hrMonitorManager.hrConnectionState = "disconnected"
  hrMonitorManager.connectedDeviceName = nil
  hrMonitorManager.pendingHRPeripheral = nil
  DispatchQueue.main.async { [weak self] in
    self?.hrConnectionState = "disconnected"
  }
  record(source: "ble.hr_monitor", title: "disconnect.requested")
}
```

**Change 5 — Add `centralManager(_:didFailToConnect:error:)` delegate** (new method in `GooseBLEHRMonitorManager`, after `didDisconnectPeripheral`):
```swift
// Pattern: mirrors didDisconnect pattern
func centralManager(
  _ central: CBCentralManager,
  didFailToConnect peripheral: CBPeripheral,
  error: Error?
) {
  hrConnectionState = "disconnected"
  hrPeripheral = nil
  DispatchQueue.main.async { [weak self] in
    self?.owner?.hrConnectionState = "disconnected"
  }
}
```

---

### `GooseSwift/MoreRouteModels.swift` (edit — add `.hrMonitor` case)

**Analog:** `GooseSwift/MoreRouteModels.swift` (full file, read above)

**Enum case addition** (after line 6 `case device`):
```swift
case hrMonitor
```

**`title` switch** (after `case .device: "Device"` on line 23):
```swift
case .hrMonitor: "HR Monitor"
```

**`subtitle` switch** (after `case .device: ...` on line 43):
```swift
case .hrMonitor: "Connect and view live heart rate from a Bluetooth HR monitor"
```

**`systemImage` switch** (after `case .device: ...` on line 61):
```swift
case .hrMonitor: "heart.circle"
```

**`statusKeyPath` switch** (after `case .device: \.device` on line 81):
```swift
case .hrMonitor: \.hrMonitor
```

**`deviceRoutes` static array** (line 97):
```swift
// BEFORE:
static let deviceRoutes: [MoreRoute] = [.device]

// AFTER:
static let deviceRoutes: [MoreRoute] = [.device, .hrMonitor]
```

**`MoreRouteStatus` struct** (lines 105–120) — add property after `var device: MoreStatusKind`:
```swift
var hrMonitor: MoreStatusKind
```

---

### `GooseSwift/MoreView.swift` (edit — add destination and routeStatus entry)

**Analog:** `GooseSwift/MoreView.swift` lines 120–153

**`destination(for:)` switch** (after `case .device:` on line 122):
```swift
case .hrMonitor:
  HRMonitorView()
```

**`MoreDataStore.routeStatus(ble:model:)`** (`GooseSwift/MoreDataStore.swift` lines 129–146) — add `hrMonitor` argument to `MoreRouteStatus(...)` initialiser call:
```swift
// Pattern: same as device line 132
hrMonitor: ble.hrConnectionState == "connected" ? .ready : .pending,
```

---

## Shared Patterns

### @EnvironmentObject + @ObservedObject split
**Source:** `GooseSwift/DeviceView.swift` lines 4–22
**Apply to:** `HRMonitorView.swift`

The outer public `struct` takes `@EnvironmentObject` and passes `model.ble` down to the private inner `struct` via an `@ObservedObject` parameter. This separation keeps the public API clean and the inner view reactively re-rendering only on `GooseBLEClient` changes.

```swift
struct HRMonitorView: View {
  @EnvironmentObject private var model: GooseAppModel
  var body: some View {
    HRMonitorContentView(ble: model.ble)
      .environmentObject(model)
  }
}

private struct HRMonitorContentView: View {
  @ObservedObject var ble: GooseBLEClient
  // view-local @State here
}
```

### DispatchQueue.main.async mirror for BLE-queue mutations
**Source:** `GooseSwift/GooseBLEClient+HRMonitor.swift` lines 141–143
**Apply to:** All new mutations of `owner?.discoveredHRDevices` and `owner?.hrConnectionState`

```swift
DispatchQueue.main.async { [weak self] in
  self?.owner?.somePublishedProperty = newValue
}
```
Never mutate `@Published` properties from the CoreBluetooth callback queue directly. Always dispatch to main.

### File-scope private constants for visual tokens
**Source:** `GooseSwift/DeviceView.swift` lines 671–702
**Apply to:** `HRMonitorView.swift`

Declare `private let` at file scope (not inside any type). Each file that needs these constants declares its own copies — there is no shared module.

### `record(source:title:body:)` for BLE events
**Source:** `GooseSwift/GooseBLEClient+HRMonitor.swift` lines 221–232
**Apply to:** New extension methods added to `GooseBLEClient+HRMonitor.swift`

```swift
record(source: "ble.hr_monitor", title: "event.name", body: optionalDetail)
```

---

## No Analog Found

All files have close analogs in the codebase. No files in scope require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `GooseSwift/` (all `.swift` files)
**Files read:** `GooseBLEClient.swift`, `GooseBLEClient+HRMonitor.swift`, `DeviceView.swift`, `ConnectionView.swift`, `MoreRouteModels.swift`, `MoreView.swift`, `MoreDataStore.swift`
**Pattern extraction date:** 2026-06-04
