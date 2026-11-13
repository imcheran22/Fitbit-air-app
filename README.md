# Apex — athlete-grade health intelligence for Fitbit data

A native Android app (Kotlin, Jetpack Compose, Room) that reads the data your Fitbit device
records and turns it into recovery, strain, sleep and training-load analytics, computed on the
phone with documented formulas. Personal use, no subscription, no data leaves the device except
calls to the data source itself.

## Status

Work is tracked in [docs/PROGRESS.md](docs/PROGRESS.md); this table follows it. Verified by unit tests, lint and the
GitHub Actions emulator smoke test. Nothing has been run against a real Google account or a real Fitbit Air yet
(items marked `UNVERIFIED-*` in [docs/OPEN_POINTS.md](docs/OPEN_POINTS.md)).

| Milestone | Scope | State |
|---|---|---|
| M0 | Audit and baseline | Done |
| M1 | Walking skeleton: Demo store through the real ingestor and pipeline | Done |
| M2 | `:core:ui`: tokens, components, shells, Canvas charts, contrast test | Done |
| M3 | `:core:network` and `:core:data`: Google sign-in (OAuth 2.0 + PKCE), Google Health API client, Health Connect reader, Takeout import, sync | Done |
| M4 | `:app`: all screens in [docs/APP_CONTRACT.md](docs/APP_CONTRACT.md), manifest, `allowBackup=false` | Done |
| M5 | Insights, alerts, rule-based coach, optional Ask Apex | Done |
| M6 | Hardening and red team ([docs/REDTEAM.md](docs/REDTEAM.md)) | Done |
| M7 | Docs and handoff; signed release workflow ([docs/RELEASES.md](docs/RELEASES.md)) | Mostly done |
| Review tracks | Scoring and data-collection alignment (formula set v3, v4 wiring) | In progress |

## Get the app on your phone (no computer needed)

1. Follow [docs/SETUP.md](docs/SETUP.md) once: Google Cloud client, a signing password stored as a GitHub secret,
   then **Actions, Release APK, Run workflow** with your client ID.
2. Download the signed APK from the **Releases** page (builds started by hand are marked Pre-release).
   Install and update steps: [docs/RELEASES.md](docs/RELEASES.md).

The workflow `.github/workflows/release.yml` signs every build with the same key, so an update installs over the old
app and keeps its data. The older workflow `android.yml` runs on every push and only produces test builds.

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
| `:core:network` | Android library | Google Health API client and OAuth 2.0 PKCE |
| `:core:data` | Android library | Repositories, Health Connect, Takeout import, sync |
| `:core:ui` | Android library | Design system, components and charts, see [docs/design/DESIGN_SYSTEM.md](docs/design/DESIGN_SYSTEM.md) |
| `:app` | Android application | Screens and wiring |

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

Every push also runs these on GitHub Actions (`.github/workflows/android.yml`). Its artifact `apex-apks` holds
`app-debug.apk` and `app-release-unsigned.apk` (test builds: not installable as updates, no stable signature).
The installable, signed build comes from the **Release APK** workflow and the Releases page; see
[docs/RELEASES.md](docs/RELEASES.md).

Optional build inputs (environment variable or `local.properties`): `APEX_GOOGLE_CLIENT_ID` / `apex.googleClientId`,
and `APEX_OAUTH_CLIENT_TYPE` / `apex.oauthClientType` = `ios` (default) or `android` (fallback).

## Data integrity rules

- Every stored value carries a provenance label: measured, Health Connect, imported, self-reported,
  derived, AI, estimated or unavailable. The UI shows it next to the number.
- Missing data stays missing. A score whose inputs are absent is reported as unavailable or
  calibrating, never filled in.
- Scores are this app's own calculations. They are not WHOOP, Oura, Garmin or Fitbit scores and
  are not medical measurements.
