# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v8.0 — Quality, Completeness & Backlog Clearance

**Shipped:** 2026-06-11
**Phases:** 9 (51–59) + Phase 60 (Band-First Sync, v9.0 start) | **Plans:** 12

### What Was Built

- Bug audit across 10 Swift + 4 Rust files; 3 HIGH + 6 MEDIUM correctness bugs fixed; data race on GooseRustBridge NSLock eliminated
- Home dashboard surfaces: Device Status Card, Tools Grid, Evidence Footer — HomeDashboardView now fully populated
- Coach content: score summaries grid + daily journal + 4 dedicated route views (Sleep/Recovery/Strain/Stress)
- Fabricated 55.0 bpm RHR baseline removed; non-activity stress now excludes exercise windows
- Energy daily rollup and real calibration pipeline (train/holdout from local data)
- More tab privacy actions, #Preview macros, algorithm preference properties wired to bridge
- Band sleep import UI wired; "not available" string replaced with live status
- Band-first sync architecture: overnight poll loop removed; foreground + BGAppRefreshTask aligned with WHOOP pattern

### What Worked

- **Autonomous execution pattern**: phases 51–59 ran as autonomous quick tasks — 9 phases in one session. Efficient for well-scoped backlog clearance where each phase has 1–2 clear deliverables
- **Parallel code-reviewer agents** (Phase 51): 2 agents across Swift and Rust files surfaced real bugs without requiring full manual audit
- **Ghidra-guided architecture** (Phase 60): reverse-engineering WHOOP 5.37.0 gave concrete rationale for removing the overnight poll loop — no guesswork about the correct pattern

### What Was Inefficient

- **Missing SUMMARY.md files**: autonomous phases 52–59 didn't generate GSD SUMMARY artifacts — milestone close required reading v8.0-ROADMAP.md instead
- **REQUIREMENTS.md not updated during execution**: traceability table left as "Pending" for all requirements despite phases being complete; had to update at close time
- **Partial v8.0 close**: v8.0-ROADMAP.md was created but REQUIREMENTS archival and MILESTONES.md were not completed in the same session — required a catch-up at next session start

### Patterns Established

- When running autonomous/quick phases, write a brief SUMMARY.md at phase close — even 5 lines — to make milestone close straightforward
- Band-first sync (foreground trigger + BGAppRefreshTask) is the correct iOS BLE sync pattern for WHOOP parity; overnight guard remains capture-research-only
- `localRust = GooseRustBridge()` per-function instance pattern confirmed as the correct approach for async functions

### Key Lessons

- Autonomous mode works well for backlog clearance phases where the requirement is already fully specified — the planning overhead is mostly friction
- Always close REQUIREMENTS.md traceability table at phase complete time, not at milestone close — the close step should be mechanical, not investigative
- Ghidra RE findings should gate architecture decisions before implementation, not after — Phase 60 benefited from having the WHPBLEHistoricalDataManager pattern confirmed before writing any code

---

## Milestone: v7.0 — Sync Correctness, Async & Sleep Sync

**Shipped:** 2026-06-10
**Phases:** 5 (46–50) | **Plans:** 18

### What Was Built

- Upload route pair: POST /v1/ingest-frames + GET /v1/export/frames endpoint pair completing iOS↔server raw frame round-trip
- device_uuid end-to-end: CoreBluetooth UUID captured at connect, stored in raw_evidence/decoded_frames, propagated to server with bidirectional lookup
- Upload sync race fix: pre-capture rowID pattern eliminates blind-marking; Rust contract TDD test locks the invariant
- HealthDataStore async migration: 60+ bridge calls migrated from GCD dispatch to async/await; zero sync calls on @MainActor
- Morning band sleep sync: V24History gravity extraction wired to gravity table; syncBandSleepHistory() flow with SQLite-first check; Cole-Kripke pipeline; Sleep V2 status labels

### What Worked

- **Parallel subagents**: Wave 1 of Phase 47 (3 plans, zero file overlap) and Phase 49 Wave 2 (5 plans) ran in parallel — significant time savings
- **TDD for correctness**: Phase 48's Rust contract test (pre_capture_does_not_mark_rows_inserted_during_race_window) caught the race semantics precisely before Swift code was written
- **Code review catching real bugs**: CR-01 in Phase 50 caught the `"complete"` vs `"synced"` status string mismatch that would have silently broken every morning sync attempt
- **Retroactive Nyquist validation**: parallel validation agents for phases 46-49 completed in <10 minutes total

### What Was Inefficient

- **Cherry-pick history rewrite**: Manual cherry-pick attempt to remove a reference from git history failed because the approach required interactive rebase (prohibited); workaround was not available
- **SourceKit false positives**: Every new Swift file addition triggered SourceKit re-indexing errors that looked alarming but were always false positives — cost diagnostic time
- **Phase 50 simulator navigation**: Tab navigation in the simulator required many taps due to modal state restoration; the SleepV2BandSyncCard confirmation took longer than expected to reach

### Patterns Established

- `localRust = GooseRustBridge()` per-function instance pattern for async functions to avoid data races with shared `@Observable` bridge instance
- BLE sync coordination via `historicalSyncStatus` polling (not `onHistoricalSyncCompleted` single slot) to avoid AppShellView callback conflict
- `bpmRefreshTask?.cancel(); bpmRefreshTask = Task { try? await Task.sleep(500ms) }` debounce pattern for high-frequency `@Observable` property changes
- Mock Xcode build validation confirmed as reliable: build succeeded with 0 errors is sufficient to proceed even when SourceKit shows false positives

### Key Lessons

- Always check the actual terminal state string in BLE callbacks against the source (GooseBLEClient) before writing polling logic — string mismatch bugs are silent and hard to trace at runtime
- Hardware-gated requirements (Phase 51) should be tracked as a deferred milestone phase, not an open blocker — the code can be shipped and validated later
- Pre-capture pattern (capture IDs before async operation) is the correct idiom for any "mark X after operation Y succeeds" synchronization problem

---

## Milestone: v4.0 — Security, Performance & Coach Expansion

**Shipped:** 2026-06-06
**Phases:** 4 (16–19) | **Plans:** 12 | **Sessions:** 1 (autonomous mode)

### What Was Built

- Deep link security guard (`allowsRemoteInvocation`) — zero new files, single property + guard line, survives all subsequent phase edits intact
- Full `@Observable` migration across 3 core classes — 68 `@Published` removed, per-property SwiftUI re-render achieved, NavigationRequestObserver warning eliminated
- Four-provider Coach system: `CoachProvider` protocol + `CoachProviderRegistry` + ChatGPT/Claude/Custom/Gemini providers + `CoachSettingsSheet` picker UI
- 128 new pt-PT strings covering all v4.0 additions; onboarding Keychain fix; startup non-blocking (overnight recovery to background queue)
- Post-audit gap closure: 9 strings fixed inline (no new phase) + UX-01 skip button architecture corrected

### What Worked

- **Wave approach for multi-provider**: Each provider added as an independent wave — no merge conflicts on shared protocol; clean isolation of Keychain logic per provider
- **@Observable migration ordered before Coach expansion**: Forced CoachView to consume correct `@Environment` pattern; no rework needed
- **Integration checker catching localisation gaps**: Found 9 missing pt-PT strings that Phase 19 should have covered; corrected inline without a new phase
- **Inline gap closure vs new phase**: Fixing 9 strings post-audit took 1 commit instead of plan → discuss → execute cycle

### What Was Inefficient

- **REQUIREMENTS.md traceability table never updated during execution**: All 10 requirements stayed `[ ]` throughout; required manual marking at archive time. Should be updated during execute-phase as plans complete.
- **Missing VERIFICATION.md for Phases 16 and 17**: Phase 16 was a pre-existing cherry-pick, Phase 17 used 4-SUMMARY as verification proxy. Both should have explicit VERIFICATION.md files.
- **VALIDATION.md (Nyquist) missing for 3 of 4 phases**: Only Phase 18 had one (and it was non-compliant). This is accumulated documentation debt.
- **Phase 19 scope didn't fully cover Phase 18 additions**: L10N-03 review found 9 strings that Phase 19 should have caught during its own verification; the integration checker was the safety net.

### Patterns Established

- **Post-audit inline fix pattern**: When a milestone audit finds a small, contained gap (< 15 strings, 1 file), fix inline with a targeted commit rather than inserting a new phase. Document as `gap_closure_applied: true` in the audit YAML.
- **Integration checker as localisation safety net**: Running the integration checker after all phases catches cross-phase localisation omissions that phase-level verification misses.
- **Phase ordering constraint**: @Observable migration must precede any phase that adds new SwiftUI views, to ensure all new views use `@Environment` from the start.

### Key Lessons

1. **Document Phase 16-type "already done" phases with a VERIFICATION.md**, even if minimal — the audit-open check flags missing verifications and creates noise at milestone close.
2. **Traceability table should be updated as requirements are satisfied** (at plan-complete time), not at milestone archive time. Stale `[ ]` at close is confusing.
3. **L10N sweep should be the last step of any phase that adds UI**, not a separate localisation phase. Or: the localisation completion phase should explicitly audit every new string in the preceding phases.
4. **Gemini OAuth pattern (WKWebView + PKCE, no SDK)** works cleanly for a self-hosted personal app; zero external SDK dependency maintained.

### Cost Observations

- Model: Sonnet 4.6 (1M context) throughout
- Sessions: 1 autonomous session with `--interactive` flag
- Notable: Integration checker (45k tokens, 48 tool calls, ~3.5 min) caught real gaps that phase-level verification missed — worth the cost at milestone close

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 5 | 12 | Initial — sequential, manual planning |
| v2.0 | 4+4.1 | 13 | Wave-based parallel execution introduced |
| v3.0 | 8 | 17 | HR monitor UX + localisation; inserted phases (10.1, 15) |
| v4.0 | 4 | 12 | Autonomous `--interactive` mode; integration checker at milestone close |

### Top Lessons (Verified Across Milestones)

1. **Wave ordering matters more than parallelism**: Correctly sequencing waves (e.g., @Observable before Coach) prevents rework better than running phases in parallel.
2. **Inline gap closure faster than new phases for < 20 items**: Fixed multiple L10N gaps across milestones with direct commits rather than discuss/plan/execute cycles.
3. **Integration checker at milestone close is the right safety net**: Phase-level verification catches intra-phase gaps; the integration checker catches cross-phase wiring and omissions.
