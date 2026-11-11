---
status: awaiting_human_verify
trigger: "CBPeripheral API MISUSE on BLE state restoration — battery characteristic discovery fires while peripheral is still in connecting state (state=1)"
created: 2026-06-11
updated: 2026-06-11
---

## Symptoms

- **Expected:** Characteristic discovery (battery 2BED) only starts after peripheral reaches `connected` state
- **Actual:** `battery.discover_characteristic.requested` fires while peripheral is still `connecting` (state=1), triggering `API MISUSE: CBPeripheral can only accept commands while in the connected state`
- **Error messages:**
  ```
  API MISUSE: <CBPeripheral: 0x110f08c40, identifier = E2401F26-3178-4D7D-612C-DFEED876CAFA, name = WHOOP FRANCISCO, mtu = 23, state = connecting> can only accept commands while in the connected state
  ble.metadata device_info.refresh.blocked peripheral state 1
  ble.metadata battery.discover_characteristic.skipped discovery_in_progress
  ```
- **Timeline:** On app launch from background with CBCentralManager state restoration (peripherals=1)
- **Reproduction:** Kill app while connected to WHOOP; relaunch → restore path triggers reconnect + premature discovery

## Log Sequence (verbatim)
```
ble central.create
ble central.restore_state peripherals=1
ble.sync historical_sync.auto_skipped reason=restore autoHistoricalSync=false prioritizeLive=false
ble reconnect.state restored
ble connection.state connecting
ble bluetooth.state powered on
ble reconnect.state already connected
app.lifecycle scene_phase active
app.lifecycle overnight.purge /var/mobile/Containers/Data/Application/.../OvernightGuard
ble.metadata battery.discover_characteristic.requested 2BED
API MISUSE: <CBPeripheral ...state = connecting> can only accept commands while in the connected state
ble.metadata device_info.refresh.blocked peripheral state 1
ble.metadata battery.discover_characteristic.skipped discovery_in_progress
```

## Current Focus

```yaml
hypothesis: "refreshBatteryLevel does not guard on peripheral.state == .connected before calling discoverCharacteristics, unlike refreshDeviceInformation which does. When DeviceView is visible on state-restore launch and .onAppear fires, the peripheral is still in .connecting state (state=1), causing the API MISUSE."
test: "Confirmed by reading GooseBLEClient+UserActions.swift — refreshDeviceInformation guards at line 392, refreshBatteryLevel has no equivalent guard."
expecting: "Adding guard activePeripheral.state == .connected at the top of refreshBatteryLevel (symmetrical with refreshDeviceInformation) will block the premature discovery call."
next_action: "Apply fix: add peripheral state guard to refreshBatteryLevel"
reasoning_checkpoint:
  hypothesis: "refreshBatteryLevel calls discoverCharacteristics on a .connecting peripheral because it lacks the peripheral.state == .connected guard that refreshDeviceInformation already has. DeviceView.onAppear fires during state restore while the peripheral is still connecting."
  confirming_evidence:
    - "refreshDeviceInformation (line 392-394, GooseBLEClient+UserActions.swift) guards: guard activePeripheral.state == .connected else { record blocked, return }"
    - "refreshBatteryLevel (line 437, GooseBLEClient+UserActions.swift) has no such guard — it proceeds to call discoverCharacteristics immediately"
    - "Log shows 'device_info.refresh.blocked peripheral state 1' (refreshDeviceInformation correctly blocked) immediately after 'battery.discover_characteristic.requested' (refreshBatteryLevel incorrectly proceeded)"
    - "DeviceView.onAppear calls both refreshBatteryLevel() and refreshDeviceInformation() at lines 96-97; both fire simultaneously during restore"
    - "willRestoreState sets peripheral state to .connecting in the restore path (log: connection.state connecting fires before the API MISUSE)"
  falsification_test: "If the bug were caused by something other than the missing guard, refreshDeviceInformation would also fire a discovery API MISUSE — but the log shows it is correctly blocked with 'device_info.refresh.blocked peripheral state 1', confirming the guard in refreshDeviceInformation works and its absence in refreshBatteryLevel is the cause."
  fix_rationale: "Adding the same peripheral.state == .connected guard to refreshBatteryLevel that refreshDeviceInformation already has will prevent discoverCharacteristics from being called on a non-connected peripheral. When the peripheral reaches .connected, the normal GATT discovery flow (didDiscoverServices → processDiscoveredCharacteristics) will set batteryLevelCharacteristic, and subsequent refreshBatteryLevel calls will take the early-return path at line 451 instead."
  blind_spots: "The DeviceView .task loop also calls refreshBatteryLevel every 60 seconds — the guard will correctly allow those calls once connected. No blind spots identified."
```

## Evidence

- timestamp: 2026-06-11T00:00:00Z
  checked: GooseBLEClient+UserActions.swift refreshDeviceInformation (line 392-394)
  found: "guard activePeripheral.state == .connected else { record 'device_info.refresh.blocked peripheral state X', return } — this guard exists"
  implication: "refreshDeviceInformation correctly blocks when peripheral is not connected"

- timestamp: 2026-06-11T00:00:00Z
  checked: GooseBLEClient+UserActions.swift refreshBatteryLevel (line 437-483)
  found: "No guard on activePeripheral.state — function proceeds to discoverCharacteristics even when peripheral is in .connecting state"
  implication: "This is the direct cause of the API MISUSE — discoverCharacteristics is called on a peripheral in state=1 (.connecting)"

- timestamp: 2026-06-11T00:00:00Z
  checked: DeviceView.swift (lines 95-98)
  found: ".onAppear { ble.refreshBatteryLevel(); ble.refreshDeviceInformation() } — both called simultaneously"
  implication: "When DeviceView is visible at app restore, .onAppear fires before the peripheral reaches .connected, triggering the premature discovery"

- timestamp: 2026-06-11T00:00:00Z
  checked: GooseBLEClient+CentralDelegate.swift willRestoreState (line 44-62)
  found: "case .connecting: updateConnectionState('connecting') — no discoverServices call, correct. The app waits for didConnect."
  implication: "The restore path itself is correct — the bug is exclusively in refreshBatteryLevel not guarding peripheral state"

- timestamp: 2026-06-11T00:00:00Z
  checked: Log sequence cross-reference
  found: "'device_info.refresh.blocked peripheral state 1' fires immediately after 'battery.discover_characteristic.requested' — confirming both calls race, but only refreshDeviceInformation has the guard"
  implication: "Asymmetric guard is confirmed as root cause"

- timestamp: 2026-06-11T00:00:00Z
  checked: GooseBLEClient+Commands.swift attemptAutomaticReconnect (line 812-814)
  found: "guard activePeripheral == nil else { updateReconnectState('already connected'); return } — this fires because activePeripheral was set by willRestoreState even though peripheral is still connecting"
  implication: "The 'reconnect.state already connected' log entry does not indicate the peripheral is actually connected — it just means activePeripheral is non-nil. This is a misleading state label but not the root cause."

## Eliminated

- hypothesis: "The restore path itself calls discoverCharacteristics prematurely"
  evidence: "willRestoreState (GooseBLEClient+CentralDelegate.swift line 44-62) only calls discoverServices when peripheral.state == .connected, and only sets updateConnectionState('connecting') for .connecting state. The restore path is correctly guarded."
  timestamp: 2026-06-11T00:00:00Z

- hypothesis: "attemptAutomaticReconnect causes the discovery"
  evidence: "attemptAutomaticReconnect only updates reconnect state to 'already connected' and returns early when activePeripheral != nil. It does not trigger any characteristic discovery."
  timestamp: 2026-06-11T00:00:00Z

## Resolution

```yaml
root_cause: "refreshBatteryLevel does not guard on activePeripheral.state == .connected before calling discoverCharacteristics, unlike its sibling refreshDeviceInformation which has that guard. DeviceView.onAppear calls both on every app restore when the DeviceView tab is visible, and during CBCentralManager state restoration the peripheral is still in .connecting (state=1), causing CBPeripheral API MISUSE."
fix: "Add guard activePeripheral.state == .connected to refreshBatteryLevel, symmetric with the guard already present in refreshDeviceInformation."
verification: "BUILD SUCCEEDED on iOS Simulator (iPhone 17, iOS 26.5). Fix adds guard activePeripheral.state == .connected to refreshBatteryLevel, symmetric with the existing guard in refreshDeviceInformation. Requires device testing: kill app while connected, relaunch, confirm API MISUSE no longer appears in console and battery.discover_characteristic.requested does not fire until peripheral reaches .connected state."
files_changed:
  - GooseSwift/GooseBLEClient+UserActions.swift
```
