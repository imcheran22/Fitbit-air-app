---
phase: 14-pt-pt-localisation
plan: "03"
subsystem: localisation
tags: [localisation, pt-PT, xcstrings, More, Connection, Onboarding, Debug, Capture]
dependency_graph:
  requires: [14-01]
  provides: [pt-PT static-string coverage for More/Connection/Onboarding/Debug/Capture/Export screens]
  affects: [GooseSwift/Localizable.xcstrings]
tech_stack:
  added: []
  patterns: [xcstrings catalog append, Python JSON merge, Wave-based localisation]
key_files:
  created: []
  modified:
    - GooseSwift/Localizable.xcstrings
decisions:
  - Wave 3 executed as single atomic commit (Tasks 1+2 merged) — both tasks modify the same file so splitting commits adds no value
  - 'Live HR' deduplicated with existing 'HR Reconnect' and similar entries (2 pre-existing skipped: Disconnect, Refresh Device)
  - Status strings from @Published properties not added (reserved for Wave 4)
  - BPM left in English (universal unit abbreviation, not localised)
  - HRMonitorView display constants (CONNECTED, SCANNING, etc.) already present from Wave 1/2 — not duplicated
metrics:
  duration_seconds: 293
  completed_date: "2026-06-05"
  tasks_completed: 2
  files_modified: 1
---

# Phase 14 Plan 03: More/Connection/Onboarding/Debug pt-PT Translations (Wave 3) Summary

**One-liner:** 328 pt-PT catalog entries for More tab, Connection/Device/HR Monitor screens, Capture/Debug/Raw Export/Remote Server surfaces, and the full Onboarding flow — bringing the total xcstrings catalog from 215 to 543 entries.

## What Was Built

Added Wave 3 static-string translations to `GooseSwift/Localizable.xcstrings` covering:

### Task 1: More tab, Connection, Device, HR Monitor

- **MoreView.swift** — section headers (App, Apple Health, Device, Settings, Support, Developer), greeting labels (Good morning/afternoon/evening), accessibilityLabel("Update profile")
- **ConnectionView.swift** — section headers (Status, Actions, Discovered, Client Hello, Event Log) and all button/label strings (Request Bluetooth, Scan/Stop Scan, Connect Selected, Reconnect Remembered, Stop Reconnecting, Forget Remembered Device, Try Again, Send Client Hello, Request Historical Packets, etc.) plus multi-line error messages
- **DeviceView.swift** — panel tabs (STATUS, ADVANCED), device fact-row labels (Firmware, Battery, Charging, Last sync, Strap clock, High freq, RR packets, Last frame), action grid buttons (Sync, Exit HF, High Freq, Stop RR/Watch RR, Forget, Clock), section headings (DISCOVERED, EVENTS), status strings (Not synced)
- **HRMonitorView.swift** — display constants (BPM), Bluetooth state messages (Enable Bluetooth to scan for HR monitors, Bluetooth access is required..., No HR monitors found...), "Disconnect HR monitor" accessibility label

### Task 2: Capture, Debug, Raw Export, Onboarding

- **MoreCaptureViews.swift** — all section headers and row labels (Session, Overnight Guard, Sleep Readiness, Raw Notifications, Range Polls, Command Writes, Targets, Historical Order, Spool, SQLite Mirror, Power, Watchdog, Final Export, WHOOP App), action buttons (Start/Stop Capture, Start/Stop Guard, Final Sync, Export Last Guard, AirDrop Final Bundle/Manifest)
- **MoreLocalStoreView / MoreHealthSyncView** — SQLite, Path, Storage Check, Schema Version, Check, Backfill Window, Metric Families, Sources, Adapter section labels and field placeholders
- **MoreDebugViews.swift** — Rust And Parser, Debug Session, Health Packet Capture, WHOOP Movement Test, WHOOP Event Signals, Research BT Commands, Diagnostics, Command Evidence, Command Shortcuts, Protected Controls sections; all row labels and action buttons; alert text
- **MoreRawExportViews.swift** — Window, Filters, Data Families, Export sections; all filter placeholders; action labels (Save Local Data File, Validate Export And Lint); status row titles; AirDrop labels
- **MoreAlgorithmsView** — Preferences, Reference Benchmarks, Metric Context sections and action labels
- **MoreRemoteServerViews.swift** — Server, Authentication, Upload, Status sections; Save button; alert title; status labels (Server reachable/unreachable, Checking..., Pending batches, Never, Now)
- **MoreProfileViews.swift / MoreInfoViews.swift** — Personal, Measurements, Apple Health sections; field labels (First name, Date of birth, Gender, Height, Inches, Weight, Units); profile values (Imperial/Metric, Female/Male/Non-binary/Prefer not to say); version/runtime labels; privacy/support labels
- **OnboardingStepViews.swift / OnboardingView.swift** — All permission step content (HealthKit/Location/Bluetooth/Notifications titles, body text, detail bullets, button titles); profile step body and validation messages; connect step heading/body/state strings; action bar buttons (Back, Continue, Finish setup, Search again, Connect selected strap, etc.)

## Acceptance Criteria

| Criterion | Result |
|-----------|--------|
| `len(strings)` ≥ 300 | **543** (was 215) |
| Valid JSON | **PASS** |

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Tasks 1+2 (Wave 3) | `4a7a0ff` | GooseSwift/Localizable.xcstrings |

## Deviations from Plan

**None** — plan executed exactly as described.

Minor notes (not deviations):
- Tasks 1 and 2 batched into a single commit (both modify the same file; splitting adds no audit value)
- 2 keys skipped as already present: `Disconnect`, `Refresh Device` (added in prior waves)
- `CONNECTED`, `SCANNING`, `CONNECTING`, `NOT AUTHORISED`, `BLUETOOTH OFF`, `HEART RATE`, `DISCOVERED` already present from Wave 1/2 — not duplicated
- `BPM` left untranslated in pt-PT value (universal unit abbreviation, not a word)

## Known Stubs

None — this plan is catalog-only; no UI rendering stubs introduced.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. Catalog-only additions.

## Self-Check: PASSED

- `GooseSwift/Localizable.xcstrings` modified: FOUND
- Commit `4a7a0ff` exists: FOUND
- Total strings 543 ≥ 300: PASS
- JSON valid: PASS
