---
id: SEED-008
status: dormant
planted: 2026-06-26
planted_during: v15.0 / Phase 118
trigger_when: when v15.0 ships and v16.0 milestone is defined
scope: large
---

# SEED-008: Android UI 1:1 parity with iOS app

## Why This Matters

Android port (v14.0) has BLE + protocol layer + basic metrics display but no equivalent to the iOS SwiftUI UI. Users on Android cannot navigate health data meaningfully — no sleep view, no HRV trends, no coach, no proper settings. Without UI parity, Android is a background data collector, not a usable app.

## When to Surface

**Trigger:** when v15.0 ships and v16.0 milestone scope is being defined

This seed surfaces automatically during `/gsd-new-milestone` when defining v16.0.

## Scope Estimate

**Large** — 3 phases minimum:

- Phase A: Health UI parity — Sleep dashboard (SleepV2 bevel + trends), HRV timeline, strain/recovery cards in Compose
- Phase B: Coach + Auth — OAuth flow, chat UI, multi-provider selector mirroring iOS CoachChatModel
- Phase C: Settings + onboarding — server URL, device identity, export, BLE status indicators

## Breadcrumbs

- `android/app/src/main/java/com/goose/app/ui/` — current Compose tabs (Home/Health/Coach/More)
- `GooseSwift/HealthDashboardViews.swift` — iOS reference for Health tab
- `GooseSwift/SleepV2BevelTrendViews.swift` — iOS reference for Sleep UI
- `GooseSwift/CoachChatModel.swift` — iOS reference for Coach
- `android/app/src/main/java/com/goose/app/AppViewModel.kt` — Android coordinator to extend
