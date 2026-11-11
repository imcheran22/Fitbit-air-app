---
phase: 107-android-ci-apk
plan: "01"
subsystem: infra
tags: [android, ci, github-actions, gradle, ndk, apk]

requires:
  - phase: 106-android-screens
    provides: android/ Gradle project building successfully with AGP 9.2

provides:
  - Active CI step building app-release-unsigned.apk on every v* tag push
  - Java 21 setup via actions/setup-java@v4 in android-core.yml
  - NDK 28.2.13676358 replacing deprecated 27.x in CI

affects: [release-workflow, android-port]

tech-stack:
  added: [actions/setup-java@v4]
  patterns: [setup-java before setup-android for AGP jvmToolchain JDK discovery]

key-files:
  created: []
  modified:
    - .github/workflows/android-core.yml

key-decisions:
  - "Java 21 via actions/setup-java@v4 (temurin) placed before setup-android — required for AGP 9.2 jvmToolchain JDK resolution in CI"
  - "NDK updated from 27.2.12479018 to 28.2.13676358 (AGP 9.2 default)"
  - "SDK packages platforms;android-36 and build-tools;36.0.0 added to setup-android packages string"
  - "APK attach step uses gh release upload with --clobber for idempotent re-runs"

patterns-established:
  - "setup-java before setup-android: ensures JAVA_HOME is set before Gradle resolves jvmToolchain"

requirements-completed: [AND-05]

duration: 8min
completed: 2026-06-21
status: complete
---

# Phase 107 Plan 01: Enable APK CI Step Summary

**Java 21 setup + NDK 28 upgrade + active APK build/attach steps in android-core.yml for unsigned APK on every v* release**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-21T00:00:00Z
- **Completed:** 2026-06-21T00:08:00Z
- **Tasks:** 4 (combined into single file edit + YAML validation)
- **Files modified:** 1

## Accomplishments

- Added `actions/setup-java@v4` with `distribution: temurin`, `java-version: 21` before the Android NDK setup step
- Updated NDK from `27.2.12479018` to `28.2.13676358` (AGP 9.2 default NDK version)
- Added `platforms;android-36` and `build-tools;36.0.0` to the `setup-android` packages string
- Uncommented `Build release APK` step (`./gradlew assembleRelease` in `android/` working-directory)
- Uncommented `Attach APK to release` step (`gh release upload` for `app-release-unsigned.apk`)
- YAML validated clean with Python yaml.safe_load; 12 steps confirmed

## Task Commits

1. **Tasks 1-4: CI workflow update** - `26dfb0e` (feat)

## Files Created/Modified

- `.github/workflows/android-core.yml` — added setup-java step, updated NDK/SDK packages, uncommented APK build and attach steps; 12 active steps total

## Decisions Made

- Java 21 via `actions/setup-java@v4 temurin` — AGP 9.2 uses jvmToolchain which requires JDK discovery; setup-java provides the JAVA_HOME env var that Gradle finds
- NDK 28.2.13676358 — AGP 9.2's default NDK; matches locally installed NDK
- `packages:` value is a space-separated single string (not multiple quoted tokens) — required by YAML syntax; `setup-android` action accepts space-separated package list in one string

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] YAML syntax fix for packages field**
- **Found during:** Task 4 (YAML validation)
- **Issue:** Initial write used multiple space-separated quoted strings for `packages:` value (`"ndk;28" "platforms;android-36" "build-tools;36.0.0"`) which is invalid YAML — Python yaml parser raised `ParserError` on line 62
- **Fix:** Merged into a single quoted string: `"ndk;28.2.13676358 platforms;android-36 build-tools;36.0.0"` — the `setup-android` action accepts space-separated packages within a single value
- **Files modified:** `.github/workflows/android-core.yml`
- **Verification:** `python3 -c "import yaml; yaml.safe_load(open(...))"` returns `YAML OK`
- **Committed in:** `26dfb0e` (combined task commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — YAML syntax bug)
**Impact on plan:** Fix essential for workflow validity; no scope creep.

## Issues Encountered

None beyond the YAML syntax deviation above, which was caught and fixed before commit.

## Self-Check

- `.github/workflows/android-core.yml` exists: confirmed
- `git log --oneline | grep 26dfb0e`: confirmed

## Self-Check: PASSED

## Next Phase Readiness

- CI will build and attach `app-release-unsigned.apk` on the next `v*` tag push
- No further CI changes needed for AND-05
- Phase 108 (Battery Level Gen4+Gen5) can proceed independently
