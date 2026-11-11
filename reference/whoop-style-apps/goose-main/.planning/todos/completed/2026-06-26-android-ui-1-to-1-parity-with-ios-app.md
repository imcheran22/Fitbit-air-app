---
created: 2026-06-26T21:16:35.186Z
title: Build Android UI 1-to-1 parity with iOS app
area: ui
files: []
---

## Problem

iOS app has a complete SwiftUI UI (health dashboard, sleep, activity, coach, BLE status, settings). Android port currently has BLE + protocol layer but no equivalent UI — users on Android have no way to view their biometric data or interact with the app.

## Solution

Build Jetpack Compose UI screens mirroring the iOS SwiftUI structure 1:1 — same tabs (Home/Health/Coach/More), same metric displays, same navigation flow. Map SwiftUI patterns to Compose equivalents (ObservableObject → ViewModel + StateFlow, @Published → collectAsState, NavigationStack → NavHost).
