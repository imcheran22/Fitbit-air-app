---
phase: 91
slug: threading-algorithm-comments
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-19
audited: 2026-06-19
---

# Phase 91 — Validation Strategy

> Per-phase validation contract for threading invariant and algorithm coefficient comments.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust built-in test runner (`cargo test`) + shell grep checks |
| **Config file** | `Rust/core/Cargo.toml` |
| **Quick run command** | `cd Rust/core && cargo test --locked comm_02 comm_03` |
| **Full suite command** | `cd Rust/core && cargo test --locked` |
| **Shell verification** | `grep -c "THREADING:" GooseSwift/GooseRustBridge.swift GooseSwift/CaptureFrameWriteQueue.swift GooseSwift/OvernightSQLiteMirrorQueue.swift GooseSwift/GooseAppModel.swift` |
| **Estimated runtime** | ~90 seconds (cargo test full); <1s (grep checks) |

---

## Sampling Rate

- **After every task commit:** Run `grep -c "THREADING:"` / `grep -c "ALGO:"` on modified files
- **After every plan wave:** Run `cd Rust/core && cargo test --locked comm_02 comm_03`
- **Before `/gsd-verify-work`:** Full Rust test suite must be green
- **Max feedback latency:** 2 seconds (grep); ~90 seconds (full cargo test)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 91-01-01 | 01 | 1 | COMM-02 | T-91-01 | Comment-only edit; no logic change | integration | `grep -c "THREADING:" GooseSwift/GooseRustBridge.swift GooseSwift/CaptureFrameWriteQueue.swift GooseSwift/OvernightSQLiteMirrorQueue.swift GooseSwift/GooseAppModel.swift` | ✅ | ✅ green |
| 91-01-02 | 01 | 1 | COMM-02 | T-91-01 | THREADING comments explain blocking FFI, @MainActor, serial-queue confinement | integration | `cd Rust/core && cargo test --locked comm_02` | ✅ | ✅ green |
| 91-01-03 | 01 | 1 | COMM-02 | T-91-01 | iOS build passes with comment-only changes | smoke | `xcodebuild build -project GooseSwift.xcodeproj -scheme GooseSwift -sdk iphonesimulator -destination "generic/platform=iOS Simulator" CODE_SIGNING_ALLOWED=NO 2>&1 \| grep -E "BUILD SUCCEEDED\|BUILD FAILED"` | — | ✅ green |
| 91-02-01 | 02 | 1 | COMM-03 | T-91-02 | Comment-only edit; no numeric value changed | integration | `grep -c "ALGO:" Rust/core/src/baselines.rs Rust/core/src/metrics.rs Rust/core/src/sleep_staging.rs` | ✅ | ✅ green |
| 91-02-02 | 02 | 1 | COMM-03 | T-91-02 | ALGO comments cite Banister, EWMA half-life, Cole 1992 | integration | `cd Rust/core && cargo test --locked comm_03` | ✅ | ✅ green |
| 91-02-03 | 02 | 1 | COMM-03 | T-91-02 | Rust test suite passes after comment-only changes | smoke | `cd Rust/core && cargo test --locked 2>&1 \| grep "test result:"` | — | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing Rust integration test infrastructure covers all phase requirements. New test file added:

- [x] `Rust/core/tests/comment_invariants_tests.rs` — 14 behavioral tests for COMM-02 and COMM-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Comments are accurate (not just present) | COMM-02, COMM-03 | Content correctness requires human judgment | Read each THREADING: and ALGO: comment and verify it accurately describes the invariant or cites the correct paper |

---

## Validation Audit 2026-06-19

| Metric | Count |
|--------|-------|
| Gaps found | 2 |
| Resolved | 2 |
| Escalated | 0 |

### Tests Created

| # | File | Type | Command |
|---|------|------|---------|
| 1 | `Rust/core/tests/comment_invariants_tests.rs` | integration | `cd Rust/core && cargo test --locked comm_02 comm_03` |

### Gap Resolution

| Gap | Requirement | Status | Evidence |
|-----|-------------|--------|----------|
| No automated test for THREADING: comments | COMM-02 | FILLED | 7 tests pass: count + content behavioral assertions |
| No automated test for ALGO: comments | COMM-03 | FILLED | 7 tests pass: count + content behavioral assertions |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 2s (grep); ~90s (cargo test)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-19
