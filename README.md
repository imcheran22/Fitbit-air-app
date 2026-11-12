# Apex — athlete-grade health intelligence for Fitbit data

A native Android app (Kotlin, Jetpack Compose, Room) that reads the data your Fitbit device
records and turns it into recovery, strain, sleep and training-load analytics, computed on the
phone with documented formulas. Personal use, no subscription, no data leaves the device except
calls to the data source itself.

## Status

The project is delivered in seven phases. Phases 1 and 2 are in this repository.

| Phase | Scope | State |
|---|---|---|
| 1 | Architecture, Gradle multi-module setup, encrypted Room database, DAOs | Done |
| 2 | Sports-science analytics engine (pure Kotlin) | Done |
| 3 | Google sign-in (OAuth 2.0 + PKCE), Google Health API client, Health Connect reader, watermark sync | Next |
| 4 | Design system and Compose Canvas charts | Theme foundation done (tokens, type, fonts); components planned |
| 5 | Screens and view models | Planned |
| 6 | AI coach and smart alerts | Planned |
| 7 | Device verification and setup guide | Planned |

Until Phase 5 the `:app` module is an empty shell: it builds, but it has no screens to launch.

## Important change from the original plan: the Fitbit Web API no longer exists

The original specification was written around the Fitbit Web API (a "Personal" app with
intraday access). Google retired that API at the end of October 2026. Its replacement is the
**Google Health API** (`https://health.googleapis.com/v4`), which serves the same wearable data
through Google sign-in. This project targets the Google Health API and Android Health Connect.
Details, including what is and is not available, are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Modules

| Module | Kind | Contents |
|---|---|---|
| `:core:domain` | Kotlin/JVM | Metric types, data provenance, source-conflict rules |
| `:core:analytics` | Kotlin/JVM | Baselines, recovery, strain, sleep, training load, trends |
| `:core:database` | Android library | Room entities and DAOs on SQLCipher |
| `:core:network` | Android library | Google Health API client and OAuth (Phase 3) |
| `:core:data` | Android library | Repositories, Health Connect, sync (Phase 3) |
| `:core:ui` | Android library | Design system and charts (Phase 4); theme in place, see [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) |
| `:app` | Android application | Screens and wiring (Phase 5) |

Every formula in `:core:analytics` is written out in [docs/FORMULAS.md](docs/FORMULAS.md).

## Design and build brief

- UI/UX: [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md), a Compose translation of the
  Pulse Mobile 0.5.0 design (dark-first, opaque cards, glass tab bar, Figtree + Barlow).
- Build brief for the agent completing the app: [docs/spec/APEX_MASTER_SPEC_V4.1.md](docs/spec/APEX_MASTER_SPEC_V4.1.md);
  working rules in [CLAUDE.md](CLAUDE.md); third-party study material indexed in [docs/REFERENCES.md](docs/REFERENCES.md).
- Bundled fonts Figtree and Barlow are under the SIL Open Font License 1.1 (`core/ui/fonts-licenses/`).

## Build and test

Requirements: JDK 17 or newer, and the Android SDK (platform 36) for the Android modules.
Android Studio installs both.

```bash
# Analytics and domain unit tests: plain JVM, no Android SDK needed
./gradlew :core:domain:test :core:analytics:test

# Database tests (Robolectric) and the debug APK
./gradlew testDebugUnitTest :app:assembleDebug
```

Every push also runs these on GitHub Actions (`.github/workflows/android.yml`); the debug APK is
attached to each run as the `apex-debug-apk` artifact.

## Data integrity rules

- Every stored value carries a provenance label: measured, Health Connect, imported, self-reported,
  derived, AI, estimated or unavailable. The UI shows it next to the number.
- Missing data stays missing. A score whose inputs are absent is reported as unavailable or
  calibrating, never filled in.
- Scores are this app's own calculations. They are not WHOOP, Oura, Garmin or Fitbit scores and
  are not medical measurements.
