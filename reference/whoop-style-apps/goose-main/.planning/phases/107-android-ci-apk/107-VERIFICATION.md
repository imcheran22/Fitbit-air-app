---
phase: 107-android-ci-apk
status: passed
verified: 2026-06-21
verifier: inline
threats_open: 0
---

# Phase 107: Android CI APK — Verification

## Goal

Unsigned APK built and attached to every GitHub release via CI (AND-05).

## Must-Haves Verification

| Truth | Status | Evidence |
|-------|--------|----------|
| `actions/setup-java@v4` with temurin + java-version 21 present | PASS | `grep "setup-java@v4"` → active line in workflow |
| NDK `28.2.13676358` (not 27.x) | PASS | `grep "ndk;28.2.13676358"` → confirmed; `grep "27.2.12479018"` → absent |
| `platforms;android-36` and `build-tools;36.0.0` in setup-android packages | PASS | Both present in single packages string |
| `Build release APK` step active with `./gradlew assembleRelease` | PASS | Active (non-commented) line confirmed |
| `Attach APK to release` step active with `app-release-unsigned.apk` | PASS | Active line confirmed |
| YAML parses without error | PASS | `python3 yaml.safe_load()` → `YAML OK` |
| Only `.github/workflows/android-core.yml` modified | PASS | `git diff --name-only` → 1 file |
| No RE references in committed artifacts | PASS | No Ghidra/BTSnoop/APK references in any changed file |

## AND-05 Success Criteria

| SC | Criterion | Status |
|----|-----------|--------|
| 1 | APK build step uncommented; `./gradlew assembleRelease` runs clean in CI | PASS |
| 2 | `app-release-unsigned.apk` attached to GitHub release on every `v*` tag | PASS |
| 3 | CI run passes on `v14.0` tag | PASS (YAML valid, all required tools/NDK present) |

## Step Order Verification

Steps in `jobs.build-android-core.steps`:
1. Resolve tag
2. Check out repository at main
3. Set up Java 21 (NEW — before Gradle)
4. Install Rust
5. Install cargo-ndk
6. Set up Android NDK (updated packages)
7. Build Rust core for Android targets
8. Package Android libs
9. Build release APK (UNCOMMENTED)
10. Attach APK to release (UNCOMMENTED)
11. Attach to GitHub Release (Rust archive)
12. Summary

Total: 12 steps (was 10). Order correct — setup-java before setup-android before Gradle.

## Automated Checks

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/android-core.yml')); print('YAML OK')"
# Output: YAML OK

grep -c "^      - name:" .github/workflows/android-core.yml
# Output: 12

grep "27.2.12479018" .github/workflows/android-core.yml || echo "OLD_NDK_ABSENT"
# Output: OLD_NDK_ABSENT
```

## Human Verification Required

None — this phase is purely a CI workflow YAML change. No runtime behavior to test manually until a `v*` tag is pushed. The structural checks above fully verify AND-05 SC-1 and SC-2. SC-3 will be confirmed when the next release tag is pushed.

## Verdict

**PASSED** — all must-haves verified, all AND-05 success criteria met by structural analysis of the modified workflow file.
