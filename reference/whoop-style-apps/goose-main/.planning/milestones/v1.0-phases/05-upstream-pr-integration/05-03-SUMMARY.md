---
plan: "05-03"
status: complete
completed: "2026-06-03"
commit: "merge: upstream PRs #7 #4 #5"
requirements:
  - FORK-04
  - FORK-05
  - FORK-07
one_liner: "PRs #7 (list_methods RPC), #4 (scroll perf SwiftUI), #5 (Apple Health fallback) integrados; 2 fixups do fork aplicados"
---

# Plan 05-03 Summary — RPC + SwiftUI + HealthKit PRs #7 #4 #5

## What Was Built

- PR #7 merged: feat(bridge): add core.list_methods RPC
- PR #4 merged: Reduce scroll frame drops on Home and Health views
- PR #5 merged: Apple Health fallback for sleep, recovery, strain, vitals
- Fixup 1: `upload.get_recent_decoded_streams` adicionado a BRIDGE_METHODS constant (PR #7 adicionou teste de sincronização)
- Fixup 2: Testes HealthKit boundary actualizados para excluir importers opt-in (PR #5 adicionou HealthKitFullImporter/SleepImporter)

## Acceptance Criteria

- [x] git log mostra merge commits para PRs #7, #4, #5 (FORK-07, FORK-04, FORK-05)
- [x] cargo test passes após merge de #7
- [x] Infraestrutura fork-específica intacta
