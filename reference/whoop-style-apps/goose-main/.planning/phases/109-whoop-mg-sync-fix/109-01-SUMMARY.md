---
phase: 109
plan: "01"
subsystem: BLE/DeviceCatalog
tags: [whoop-mg, device-catalog, ble, swift, hardware-gate]
dependency_graph:
  requires: []
  provides: [MG-aware-DeviceCatalog]
  affects: [CoreBluetoothBLETransport, HistoricalSync logging]
tech_stack:
  added: []
  patterns: [DeviceCatalog branching, hardware gate annotation]
key_files:
  created: []
  modified:
    - GooseSwift/DeviceCatalog.swift
    - GooseSwift/CoreBluetoothBLETransport+Commands.swift
decisions:
  - DeviceCatalog.generationLabel now returns "mg" for WHOOP_MG (D-04 fix)
  - DeviceCatalog.historicalDeviceType now returns "WHOOP_MG" for WHOOP_MG (D-04 fix)
  - Hardware gate comment uses "hardware testing" language (D-05)
  - Name heuristic preserved unchanged (D-02)
metrics:
  duration: "~8 min"
  completed: "2026-06-21"
status: complete
---

# Phase 109 Plan 01: MG Sync Logging Hardening + Detection Gate + Issue #22 Summary

**One-liner:** DeviceCatalog MG branch added (generationLabel→"mg", historicalDeviceType→"WHOOP_MG") with hardware gate annotation and issue #22 progress comment.

## What Was Built

- **DeviceCatalog.generationLabel** now returns `"mg"` for `WHOOP_MG` device kind (previously returned `"gen5"` — logging inaccuracy fixed)
- **DeviceCatalog.historicalDeviceType** now returns `"WHOOP_MG"` for `WHOOP_MG` device kind (previously returned `"GOOSE"` — logging inaccuracy fixed)
- **Commands.swift hardware gate** annotation strengthened with explicit `// hardware_gate:` comment documenting that MG sync requires hardware testing on a physical WHOOP MG device
- **GitHub issue #22** received a neutral progress comment per D-05 (no BLE advertisement analysis framing, no internal class names)
- **BUILD SUCCEEDED** — zero compile errors on iOS Simulator (iPhone 17 Pro)

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Fix DeviceCatalog.generationLabel and historicalDeviceType for MG | 67db781 |
| 2 | Strengthen hardware gate annotation in Commands.swift | 6768d96 |
| 3 | Post neutral progress comment on GitHub issue #22 | https://github.com/tigercraft4/goose/issues/22#issuecomment-4762870987 |
| 4 | Build verification — xcodebuild BUILD SUCCEEDED | (no commit — verification only) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. DeviceCatalog changes are complete and accurate for the available information.
Full MG sync verification (packet delivery confirmation) remains hardware-gated pending
access to a physical WHOOP MG device — this is explicitly documented in code and issue #22.

## Threat Flags

None. Changes are Swift-only logging label corrections and documentation comments.
No new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check: PASSED

- `GooseSwift/DeviceCatalog.swift` contains `if caps.deviceKind == "WHOOP_MG" { return "mg" }` — VERIFIED
- `GooseSwift/DeviceCatalog.swift` contains `if capabilities?.deviceKind == "WHOOP_MG" { return "WHOOP_MG" }` — VERIFIED
- `GooseSwift/CoreBluetoothBLETransport+Commands.swift` contains `hardware_gate: MG historical sync` — VERIFIED
- Commits 67db781 and 6768d96 exist in git log — VERIFIED
- BUILD SUCCEEDED on iPhone 17 Pro simulator — VERIFIED
- Issue #22 comment posted at https://github.com/tigercraft4/goose/issues/22#issuecomment-4762870987 — VERIFIED
