# Phase 51: Bug Audit — Discussion Context

## Phase Goal
Known bugs and correctness issues from v6.0–v7.0 (phases 36–50) are identified, documented, and fixed.

## Requirements
- AUDIT-01: Code review of v6.0–v7.0 finds and fixes correctness bugs, data races, and edge cases in Rust and Swift

## Success Criteria
1. Every phase 36–50 reviewed; written audit report lists findings by severity (HIGH / MEDIUM / LOW)
2. All HIGH findings fixed and verified before phase closes
3. No data race or crash-class finding remains open
4. MEDIUM findings either fixed or explicitly deferred with rationale

## Auto-Discussion (Autonomous Mode)

**Q: What areas are highest risk for bugs?**
A: Based on v7.0 milestone summary:
- HealthDataStore async migration (Phase 49): 60+ call sites migrated; residual sync callers in MoreDataStore (18+) and GooseAppModel+Upload (2)
- Upload sync race fix (Phase 48): Swift XCTest assertions skip — Rust contract test covers but Swift path not fully tested
- Morning band sleep sync (Phase 50): CR-01 'synced' status fix + WR-01/02/03 local bridge — verify edge cases
- V24 biometrics (Phase 38): decoders not implemented — data shows "--" by design; verify no null dereference
- Algorithm alignment (Phase 42): EWMA alpha=0.0483, Z-score+logistic — verify coefficient application

**Q: What is the scope of the review?**
A: All Swift files touched in v6.0-v7.0 (git range 0df9e90..d5af8e6 excluding docs commits). Focus on:
- Data races (main thread bridge calls)
- Crash-class bugs (force unwraps on optional chains)
- Logic errors in algorithm wiring
- Missing nil checks on BLE data paths
- Async/await correctness (actor isolation violations)

**Q: What constitutes HIGH vs MEDIUM vs LOW?**
A: 
- HIGH: crash risk, data corruption, silent data loss, main thread freeze
- MEDIUM: wrong calculation result, stale UI, misleading badge, logic error that produces wrong output
- LOW: cosmetic, missing string, minor UX inconsistency

## Decisions
- Phase uses gsd-code-reviewer agent to scan changed files
- HIGH findings must be fixed in this phase; MEDIUM may be deferred with rationale
- Deferred items go to ROADMAP.md backlog
