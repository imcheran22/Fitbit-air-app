# Changelog

All notable changes to **Synheart Wear** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.3] - 2026-10-07

### Fixed
- **Real-time reads are rate-limited.** `streamHR` / `streamHRV` call
  `readMetrics(isRealTime = true)` every tick (1-3 s), and each call ran five
  Health Connect queries (HR, HRV, steps, calories, distance) plus a network
  fetch of the latest recovery record from every connected cloud provider.
  Health Connect has a per-app read quota and receives watch data in batches,
  so most of those reads returned the same samples. Real-time ticks now read
  Health Connect at most every 10 s and cloud recovery at most every 15 min;
  ticks in between carry only the live BLE HRM sample (or nothing). Non
  real-time reads are unchanged.

## [0.4.2] - 2026-10-02

### Fixed
- **BLE HRM: a low-latency connection is requested before subscribing to HR
  notifications.** On the platform's default (balanced) connection interval a
  chest strap that reports one notification per heartbeat cannot always get
  every beat across once the heart rate passes roughly 70 bpm, and it drops
  the beats it could not send. The HR value stays plausible, so the loss was
  invisible; only the RR series came up short. `CONNECTION_PRIORITY_HIGH` is
  now requested on connect. Advisory: the stack may decline.

## [0.4.1] - 2026-05-27

### Added
- `HealthHistoryReader` contract for historical Health Connect reads
  (backfill) (#17).
- MockWebServer integration test scaffold.

### CI
- All workflows opt into Node 24 (June 2026 deprecation prep).
- close-external-prs org-membership check repaired.

## [0.4.0] - 2026-05-15

First public release. Adds Fitbit + Oura cloud providers to reach
parity with the Flutter/Swift siblings, modernizes the build for
AGP 9 / Gradle 9.2 / Kotlin 2.3, ships a Compose example app and a
`/docs/` scaffold, and contracts the public API surface for
long-term stability.

### Added
- **FitbitProvider** and **OuraProvider** — cloud OAuth + data fetch
  via the vendor-templated Retrofit endpoints on `WearServiceAPI`.
  Both implement `WearableProvider`. New `OURA` case on
  `DeviceAdapter`. Wired into `SynheartWear` via `fitbit` / `oura`
  accessors and `getProvider(FITBIT|OURA)`. MockK tests for both.
- README "Documentation" section links to the central Mintlify
  docs site at <https://docs.synheart.ai/synheart-wear/kotlin> —
  single source of truth shared with the Swift / Flutter siblings.
- `/example-app/` — Jetpack Compose Android demo wired as a Gradle
  subproject (`include(":example-app")` in `settings.gradle.kts`).
- `auto-tag-release.yml` workflow — push to `release` branch reads
  `VERSION_NAME` and tags `vX.Y.Z`, mirroring `synheart-auth-kotlin`.
- `readMetricsFromProvider` now handles `GARMIN`, `FITBIT`, `OURA`,
  `BLE_HRM` (previously fell through to "not yet implemented" for
  every provider except `WHOOP` and `HEALTH_CONNECT`).

### Changed
- **Build modernized for AGP 9.0 / Gradle 9.2 / Kotlin 2.3.**
  protobuf plugin `0.9.6` → `0.10.0` (the earlier version hit the
  removed `BaseExtension` API). Hoisted
  `com.android.application` + `kotlin.plugin.compose` to root with
  `apply false`. Wired protobuf-generated `java/kotlin/grpc/grpckt`
  output into `android.sourceSets.main` and added the `java` builtin
  so lite Kotlin messages compile. Added
  `io.grpc:grpc-protobuf-lite:1.62.2`. `:example-app` uses
  `coreLibraryDesugaring` to match the parent AAR.
- **`RamenClient.kt`** updated for `option java_multiple_files = true`
  proto layout and replaced the removed
  `MetadataUtils.attachHeaders(stub, metadata)` with
  `stub.withInterceptors(MetadataUtils.newAttachHeadersInterceptor(...))`.
- **`CloudConfig.baseUrl` default normalized** from a typo'd Render
  staging URL (`synheart-wear-service-leatest.onrender.com`) to the
  canonical `https://api.synheart.ai/wear`. Test URLs across four
  files normalized to the same value.
- **Public API surface contracted** for first OSS release:
  `WearServiceAPI`, `WearAdapter`, `Normalizer`, `HeartRateParser`,
  the entire `cloud.models` package (17 wire-level data classes),
  and the Ramen types (`RamenClient`, `RamenConfig`, `RamenEvent`,
  `RamenConnectionState`) are now `internal`. Cloud providers
  (Whoop / Garmin / Fitbit / Oura) refactored to internal-primary
  + public-secondary constructor pattern so the public ctor no
  longer exposes the now-internal `WearServiceAPI`.
- **`GarminHealth`** stub methods now throw `SynheartWearException`
  pointing at `GARMIN_SETUP.md` instead of silently returning
  `emptyFlow()` / `emptyList()` when the licensed native binary is
  absent.

### Removed
- **`CloudWearableAdapter`** and **`getCloudAdapter()`** — parallel
  duplicate of the per-vendor providers. Cloud sources in
  `readMetrics()` route through each per-vendor provider directly
  via a small `pullLatest()` helper.
- **`WearSession`** — declared but only referenced by its own test;
  zero production callers.

### Fixed
- `HealthConnectAdapter` no longer emits actual biometric values
  (HR / HRV / steps / calories / distance) to logcat at `Log.d`;
  log lines now carry only counts/units, in line with the SDK's
  own privacy guidance.
- `SynheartWearConfigTest` adapter-count assertion updated from
  6 → 7 to reflect the new `OURA` enum case.
- `.gitignore` rules `docs/` and `*.md` removed (they had blocked
  `git add docs/` and orphaned `GARMIN_SETUP.md` from the working
  tree since May 7); `GARMIN_SETUP.md` now committed.

## [0.3.0] - 2026-02-18

### Added
- Health Connect integration for unified biometric data access on Android.
- Cloud wearable adapters (WHOOP, Garmin, Fitbit) via Synheart Wear Service.

### Changed
- Updated build tooling (Android Gradle Plugin 8.2.x, Kotlin 1.9.x).

### Fixed
- Various stability improvements and test coverage updates.

[Unreleased]: https://github.com/synheart-ai/synheart-wear-kotlin/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/synheart-ai/synheart-wear-kotlin/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/synheart-ai/synheart-wear-kotlin/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/synheart-ai/synheart-wear-kotlin/releases/tag/v0.4.0
[0.3.0]: https://github.com/synheart-ai/synheart-wear-kotlin/releases/tag/v0.3.0

