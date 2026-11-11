---
name: ios-notifications
description: Local iOS notifications for sleep summary, workout detection, and WHOOP battery — verified against WHOOP binary via Ghidra
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Add local iOS notifications to Goose for the three moments that genuinely matter to the user.

## Notifications (3)

### 1. Sleep summary
- **Trigger**: `syncBandSleepHistory()` completes with a valid sleep staging result
- **Type**: Immediate local notification
- **Content**: duration + HRV + estimated recovery (e.g., "Sono de 7h12 — HRV 52 ms")
- **Notes**: overnight guard no longer exists; sleep sync is triggered by BLE connect in the morning

### 2. Workout detected
- **Trigger**: `.finished(PassiveDetectedActivitySummary, reason:)` emitted by `PassiveActivityDetector`
- **Type**: Immediate local notification
- **Content**: duration + strain (e.g., "Treino de 42 min detectado — strain 8.3")

### 3. WHOOP battery low
- **Trigger**: BLE battery level update (GATT 0x180F / 0x2A19) drops below threshold
- **Type**: `UNCalendarNotificationTrigger` scheduled ahead — fires even with app killed
- **Mechanism**: Goose already has `bluetooth-central` background mode; BLE events wake the app briefly in background, allowing notification rescheduling (same mechanism as WHOOP)
- **Drain rate**: calculate from SQLite `battery` table (`{ ts, level_pct }`) — two readings give %/hour; project to threshold crossing time
- **Cancellation**: cancel and reschedule on each new BLE reading

## Research basis

Verified against WHOOP iOS v5.37.0 binary (Ghidra, 2026-06-11):
- `WhoopLocalNotifications` Swift package: `WhoopBatteryNotificationsManager`, `WhoopOffBodyNotificationManager`, `StrapBackInRangeNotificationManager`
- Battery uses `UNTimeIntervalNotificationTrigger` / `UNCalendarNotificationTrigger` — scheduled while running, delivered by iOS daemon when app is dead
- `offBodyNotificationDelaySecs` confirms delay-then-cancel pattern
- Push notifications (`recovery_processed_v1`) are server-side only — not relevant for Goose (no WHOOP backend)

## What NOT to build

- Reconnect / off-body notifications — operational noise, low value in Goose context
- Multiple time-remaining battery variants (ThreeDay, ThirtySixHour…) — WHOOP has no SQLite drain rate history; Goose does, so one well-timed notification is sufficient
- Server-side push — no APNs infrastructure planned

## Implementation notes

- Requires `UNUserNotificationCenter` permission request (add to onboarding flow)
- Single `NotificationScheduler` actor to own all three notification types
- No new background modes needed — `bluetooth-central` already declared
