<p align="center"><img src="docs/logo.png" alt="fitdash" width="420"></p>

# fitdash

Site: https://mayurrawte.is-a.dev/fitdash/

A calm, animated Health Connect dashboard for Android. Recovery, sleep, activity and trends on four swipeable pages, in three themes (Soft follows your system dark mode), from whatever your watch or ring writes to Health Connect.

- No account, no cloud, no internet permission. Your data stays on your phone.
- Reads every Health Connect data type and shows only what you have.

## Your data stays yours

fitdash is built so that data only leaves your phone when you choose to share it.

- **No server, no API, no account.** There is no backend. Nothing to sign up for.
- **No internet permission.** The release APK requests no `INTERNET` permission, so fitdash itself cannot connect to the internet. It can open links (the GitHub page, Buy Me a Coffee and the Play Store page for Health Connect) in your browser or the Play Store; these carry none of your data.
- **Writes only what you enter.** fitdash writes only the water, height, protein and caffeine you enter yourself (protein and caffeine on the GitHub build only). It never changes or deletes any other data. Undo deletes only the water entry you just added.
- **No analytics, crash reporting, ads or trackers.** The only third-party libraries are AndroidX/Compose and the Health Connect client.
- **Nothing leaves unless you share it.** "Ask AI" and "Share day" open the Android share sheet. You pick the app; fitdash makes no network connections and hands the text or image to it. Both contain health metrics, so the app or AI service you pick handles them under its own privacy policy.
- **One private copy, for speed.** So it opens instantly, fitdash keeps a copy of the data it last read from Health Connect in its private app storage, replaced on each read. The image Share day creates sits in the private cache until the next share. Other apps can't read either, backup is off, and clearing storage or uninstalling removes both.
- **Health Connect is separate.** It keeps its own copy under its own controls and backup settings; `allowBackup=false` covers fitdash's files only.
- **Delete your data.** Clear fitdash's storage or uninstall it (this removes its settings and its copy of your data), revoke access in Health Connect (Settings > Health Connect > App permissions), and delete the data itself in Health Connect.

Read the full [privacy policy](https://mayurrawte.is-a.dev/fitdash/privacy.html).

### Verify it yourself

Don't take our word for it. Check the APK you downloaded:

```
# 1. No INTERNET permission (only Health Connect READ permissions, plus WRITE_HYDRATION, WRITE_HEIGHT and WRITE_NUTRITION)
#    plus WAKE_LOCK and RECEIVE_BOOT_COMPLETED, which Android's WorkManager uses to keep the opt-in background
#    refresh (Settings › Background refresh) scheduled. It only updates the private copy and the widget.
aapt dump permissions fitdash.apk

# 2. Signing certificate matches the one below
apksigner verify --print-certs fitdash.apk
```

Expected SHA-256 of the signing certificate:

```
15:9A:A2:14:AC:84:59:08:E6:D4:30:90:2D:50:D4:FA:85:AA:9C:E1:92:21:E7:9C:E7:3A:83:CA:B5:9E:55:72
```

(plain hex: `159aa214ac845908e6d430902d50d4fa85aa9ce19221e79ce73a83cab59e5572`)

You can also read [`app/src/main/AndroidManifest.xml`](app/src/main/AndroidManifest.xml), or build it yourself with `./gradlew :app:assembleGithubRelease`. Release APKs are built and signed by GitHub Actions from this public source ([`release.yml`](.github/workflows/release.yml)), triggered by version tags.

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## Install

Download the latest APK: **[fitdash.apk](https://github.com/mayurrawte/fitdash/releases/latest/download/fitdash.apk)** (all builds on the [releases page](https://github.com/mayurrawte/fitdash/releases)). Needs Android 8+ and Health Connect.

## Build

Requires JDK 17 and the Android SDK.

```
./gradlew :app:installGithubDebug
```

## Publishing

Google Play builds, the store listing and the release checklist are in [docs/play/PUBLISHING.md](docs/play/PUBLISHING.md).

## Licence

GPL-3.0. See [LICENSE](LICENSE).

The fitdash name and icon are not covered by the licence. Forks must use a different name and icon.
