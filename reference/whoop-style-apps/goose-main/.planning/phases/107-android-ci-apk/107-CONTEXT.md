# Phase 107: Android CI APK - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Uncomment the existing commented-out APK build + attach steps in `.github/workflows/android-core.yml`. Add Java 21 setup step (Kotlin 2.x incompatible with Java 26 version string). Ensure `./gradlew assembleRelease` succeeds in CI and `app-release-unsigned.apk` is attached to every `v*` release.

**In scope:** Uncommenting CI steps, adding JDK 21 setup, verifying `assembleRelease` works, APK attached to GitHub release.
**Out of scope:** Code signing, Play Store upload, armeabi-v7a/x86_64 APK variants.

</domain>

<decisions>
## Implementation Decisions

### JDK version
- **D-01:** Use **Java 21** in CI — `actions/setup-java@v4` with `java-version: '21'`. Kotlin 2.1.21 + AGP 8.10.1 fail to parse Java 26 version string (`IllegalArgumentException: 26.0.1`). This was the blocking issue locally and was fixed with `gradle.properties` pinning Java 21.
- **D-02:** Place `setup-java` step BEFORE the `./gradlew assembleRelease` step, AFTER checkout.

### Android SDK in CI
- **D-03:** `setup-android` action (already present) provides `ANDROID_HOME` and NDK. Gradle's `local.properties` must NOT be committed with a hardcoded path — use `ANDROID_HOME` env var which Gradle picks up automatically.
- **D-04:** Android SDK platform (API 35 or 36) and build-tools must be installed. Add `platforms;android-36` and `build-tools;35.0.0` to `setup-android` packages list if not already present.

### APK steps (already in CI as comments)
- **D-05:** Uncomment the two existing commented blocks in `android-core.yml`:
  1. `Build release APK` — `./gradlew assembleRelease` in `android/` working directory
  2. `Attach APK to release` — `gh release upload` for `app-release-unsigned.apk`

### Claude's Discretion
- Order of steps: checkout → setup-java → setup-android (NDK + SDK) → build Rust → build APK → package libs → attach all
- `local.properties` must be gitignored (it is) — CI must not need it; uses `ANDROID_HOME` env var

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing CI workflow to modify
- `.github/workflows/android-core.yml` — already has commented APK steps at bottom; this is the ONLY file to change

### Local gradle.properties (for JDK reference)
- `android/gradle.properties` — has `org.gradle.java.home` pointing to Java 21; CI must override with `ANDROID_HOME` + use `setup-java` action

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Commented APK build steps already in `android-core.yml` — just uncomment
- `setup-android` action already installs NDK; add SDK packages to same action

### Established Patterns
- iOS CI uses `actions/setup-java` and similar action chains — follow same pattern
- `gh release upload` command pattern already used for Rust archive attachment

</code_context>

<specifics>
## Specific Ideas

- Java setup action: `uses: actions/setup-java@v4` with `distribution: 'temurin'`, `java-version: '21'`
- Android packages to add: `"platforms;android-36" "build-tools;36.0.0"` (check what AGP 8.10.1 requires)
- The local `android/gradle.properties` has `org.gradle.java.home` — CI must set `JAVA_HOME` via `setup-java` action so Gradle picks it up; or remove the `org.gradle.java.home` line and let the action's `JAVA_HOME` env var suffice

</specifics>

<deferred>
## Deferred Ideas

- APK signing (release keystore) — out of scope; unsigned APK is sufficient for sideloading via AltStore or direct install
- Multi-ABI APK (armeabi-v7a, x86_64) — deferred; arm64-v8a covers modern devices

</deferred>

---

*Phase: 107-android-ci-apk*
*Context gathered: 2026-06-21*
