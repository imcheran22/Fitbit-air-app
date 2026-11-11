# Phase 86: bridge.rs Split + Protocol Comments — Discussion Log

**Date:** 2026-06-15
**Participants:** User + Claude

---

## Area 1: Namespace Grouping

**Question:** bridge.rs has 33 method namespaces. ROADMAP specifies 5 target files. How to group?

**Options presented:**
- 5 files as ROADMAP (planner groups 33 namespaces by semantic affinity)
- 1 file per namespace (33 files)
- 8–10 thematic files

**User response:** "o que recomendas?" → asked for recommendation

**Claude recommendation accepted:** 5 files as ROADMAP with this mapping:
- `bridge/metrics.rs` ← metrics, metric_series, exercise, biometrics, battery, calibration, openwhoop, diagnostics
- `bridge/sleep.rs` ← sleep, overnight, health_sync
- `bridge/capture.rs` ← capture, protocol, historical_sync, sync, ios
- `bridge/activity.rs` ← activity, workout, apple_daily, journal, timeline
- `bridge/debug.rs` ← debug, commands, core, settings, storage, store, export, upload, privacy, ui_coverage, device

**Locked as D-01.**

---

## Area 2: Dispatch Mechanism

**Question:** ROADMAP says "BridgeRouter trait (or equivalent)". Which mechanism?

**Options presented:**
- `pub(crate)` functions per domain, no trait
- BridgeRouter trait with per-domain methods
- Macro-generated dispatch table

**User selection:** Funções por domínio, sem trait

**Locked as D-02.**

---

## Area 3: Protocol Comment Scope

**Question:** Comment only the 3 ROADMAP-specified sites (Event-48, cmd 26, R22) or all non-obvious wire-decode sites?

**Options presented:**
- Only 3 ROADMAP sites
- All non-obvious parse sites
- Claude's discretion

**User selection:** Todos os parse sites não-óbvios

**Rationale:** SEED-005 principle — comment WHY not WHAT; wire offsets are exactly the non-obvious WHY. Expands SC3 scope but consistent with project's comment policy.

**Locked as D-03.**

---

## Context7 / Research Note

User requested Context7 opinion on namespace grouping. Context7 and web search unavailable in this environment. Decision made from Rust idiom knowledge — pattern matches tokio/sqlx/serde large codebase splits.

---

## Deferred Ideas

None.
