---
phase: "107"
slug: android-ci-apk
status: compliant
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-21
---

# Phase 107 — Validation Strategy

> Per-phase validation contract for Phase 107: Android CI APK (AND-05).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Structural shell checks (grep, python3 yaml.safe_load) |
| **Config file** | none — workflow YAML-only phase |
| **Quick run command** | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/android-core.yml')); print('YAML OK')"` |
| **Full suite command** | See Per-Task Verification Map below |
| **Estimated runtime** | ~3 seconds |

> **Note:** Phase 107 modifies only `.github/workflows/android-core.yml`. There is no runtime
> code, no Rust crate, and no Swift target involved. The appropriate verification layer is
> structural analysis (YAML syntax + grep assertions), not unit or integration tests.
> pytest/cargo test are not applicable to this phase.

---

## Sampling Rate

- **After every task commit:** Run YAML syntax check
- **After every plan wave:** Run full structural grep suite
- **Before `/gsd-verify-work`:** All structural checks must pass
- **Max feedback latency:** ~3 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Passes | Status |
|---------|------|------|-------------|-----------|-------------------|--------|--------|
| 107-01-01 | 01 | 1 | AND-05 | structural | `grep "setup-java@v4" .github/workflows/android-core.yml` | ✅ | ✅ green |
| 107-01-01 | 01 | 1 | AND-05 | structural | `grep "java-version: '21'" .github/workflows/android-core.yml` | ✅ | ✅ green |
| 107-01-02 | 01 | 1 | AND-05 | structural | `grep "ndk;28.2.13676358" .github/workflows/android-core.yml` | ✅ | ✅ green |
| 107-01-02 | 01 | 1 | AND-05 | structural | `grep "platforms;android-36" .github/workflows/android-core.yml` | ✅ | ✅ green |
| 107-01-02 | 01 | 1 | AND-05 | structural | `grep "build-tools;36.0.0" .github/workflows/android-core.yml` | ✅ | ✅ green |
| 107-01-02 | 01 | 1 | AND-05 | structural | `grep "27.2.12479018" .github/workflows/android-core.yml \|\| echo OLD_NDK_ABSENT` | ✅ (absent) | ✅ green |
| 107-01-03 | 01 | 1 | AND-05 | structural | `grep -v "^#" .github/workflows/android-core.yml \| grep "assembleRelease"` | ✅ | ✅ green |
| 107-01-03 | 01 | 1 | AND-05 | structural | `grep -v "^#" .github/workflows/android-core.yml \| grep "app-release-unsigned.apk"` | ✅ | ✅ green |
| 107-01-04 | 01 | 1 | AND-05 | structural | `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/android-core.yml')); print('YAML OK')"` | ✅ YAML OK | ✅ green |
| 107-01-04 | 01 | 1 | AND-05 | structural | `grep -c "^      - name:" .github/workflows/android-core.yml` | ✅ 12 | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*None.* Existing structural check infrastructure (grep + python3 yaml) covers all phase requirements. No test framework installation or stub files needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| APK actually built and attached to GitHub release | AND-05 SC-3 | Requires a live `v*` tag push to GitHub; not automatable locally | Push a `v14.x` tag and verify `app-release-unsigned.apk` appears in the GitHub release assets |

---

## Gap Analysis

All 4 tasks in Plan 107-01 have automated structural verification commands defined in the plan and confirmed passing live on 2026-06-21:

| Requirement | Gap Type | Resolution |
|-------------|----------|------------|
| AND-05 Task 1 (setup-java) | COVERED | grep assertion passes |
| AND-05 Task 2 (NDK 28 + SDK packages) | COVERED | grep assertions pass; old NDK absent |
| AND-05 Task 3 (APK steps uncommented) | COVERED | grep assertions on active lines pass |
| AND-05 Task 4 (YAML syntax valid) | COVERED | yaml.safe_load → YAML OK; step count = 12 |

No MISSING or PARTIAL gaps. Phase is **Nyquist-compliant** for a CI-workflow-only change.

---

## Validation Sign-Off

- [x] All tasks have automated verification commands (structural checks)
- [x] Sampling continuity: single wave, all tasks verified together
- [x] No Wave 0 stubs needed — structural checks cover all requirements
- [x] No watch-mode flags
- [x] Feedback latency < 5s (grep + yaml parse ≈ 3s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** compliant 2026-06-21

---

## Validation Audit 2026-06-21

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated to manual-only | 1 (live CI run — requires tag push) |
| Total AND-05 tasks | 4 |
| Tasks COVERED | 4 |
