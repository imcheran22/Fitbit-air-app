---
status: complete
phase: 60-band-first-sync-align-goose-ble-sync-architecture-with-whoop
source: [60-01-SUMMARY.md, 60-02-SUMMARY.md, 60-03-SUMMARY.md]
started: 2026-06-11T10:35:54Z
updated: 2026-06-11T10:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. App Cold Start
expected: Kill the running app in the simulator. Launch fresh. App opens to the main tab bar without crashing and without showing any overnight-guard-related startup error or hang.
result: pass

### 2. Overnight Guard Section Removed from Capture Screen
expected: Open More tab → Developer → Capture. The screen should show ONLY these sections: "Session", "Imports And Matching", and "Recent Capture Sessions". There should be NO "Overnight Guard" section anywhere on the screen.
result: pass

### 3. D-03 On-Disk Purge Event Visible
expected: After a fresh app launch (first time since update), the Recent Notifications And Events list shows an `overnight.purge` entry. The status/description field reads "Pronto" (or similar success indicator), confirming the legacy OvernightGuard directory was cleaned up.
result: pass

### 4. Foreground Sync Trigger Fires on App Activation
expected: When app returns to foreground with WHOOP connected, a BLE sync is triggered (visible as event in Recent events); when no WHOOP connected, no crash or hang.
result: blocked
blocked_by: physical-device
reason: "Simulator: BLE unsupported. triggerForegroundBLESync() is called (confirmed via scene_phase | active event + code inspection of handleAppLifecycleChange), but D-07 guard (ble.connectionState == ready) exits early before logging — correct behaviour. Full observable test requires WHOOP device connected."

### 5. 30-Minute Cooldown Guard Prevents Double Sync
expected: Immediately background and re-foreground the app again (within 30 seconds of the previous test). Recent Notifications And Events should show a NEW `foreground_sync.skipped` event, confirming the cooldown guard is active and the sync was not re-triggered.
result: blocked
blocked_by: physical-device
reason: "Cooldown logic implemented correctly in code (UserDefaults timestamp + 30-min window). Not observable in simulator without WHOOP connected and connectionState == ready."

### 6. BGTask Plist Keys Present
expected: In the built app, Info.plist contains `BGTaskSchedulerPermittedIdentifiers` with value `com.goose.swift.bg-sync`, and `UIBackgroundModes` includes both `bluetooth-central` and `fetch`.
result: pass

## Summary

total: 6
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 2

## Gaps

[none]
