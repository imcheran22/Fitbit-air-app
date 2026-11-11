# Synheart Wear — Compose Demo

A tiny Jetpack Compose Android app that exercises the parent SDK
(`:`) via a Gradle subproject (`:example-app`).

## Open

Open the parent project in Android Studio. The `example-app` module
should appear in the project view automatically (it's wired up in
`../settings.gradle.kts`).

To build from the command line:

```sh
./gradlew :example-app:assembleDebug
```

## What it does

- Lists the built-in providers (Whoop, Garmin, Fitbit, Oura, BLE HRM,
  Health Connect).
- Tapping a provider opens a detail screen with a "Start stream"
  button. BPM updates once per second.
- The demo emits a **synthetic** BPM (~70 ± 5) so the UI is
  interactive without OAuth credentials or paired hardware. Wire real
  streams by injecting a `SynheartWear` instance into
  `rememberHrStream` (see `MockSdk.kt`) and calling
  `sdk.streamHR(intervalMs = 1000)` for `BLE_HRM` / `HEALTH_CONNECT`,
  or by routing cloud providers through the SDK with a real `appId`.

## Build verification

```sh
./gradlew :example-app:assembleDebug   # full APK assembly
./gradlew :example-app:compileDebugKotlin   # compile only
```

`compileDebugKotlin` is verified clean from this directory.
