# Releases: installing and updating Apex

For the owner. Everything here works from a phone. The set-up order (Google Cloud, signing password, client ID) is
in `docs/SETUP.md` sections 3 to 6 (main path: iOS-type client, section 6 is the Android fallback); this page is the day-to-day part.

## Where the APK comes from

The workflow **Release APK** (`.github/workflows/release.yml`) builds Apex on GitHub, signs it with your key and
publishes it.

- Start it: **Actions**, **Release APK**, **Run workflow**. Paste the Google client ID, keep `publish_release` ticked.
- Pushing a tag that starts with `v` (for example `v0.2.0`) starts it too and publishes a normal (non-pre-release) release.
- Easy download: the repository's **Releases** page. Builds started by hand are marked **Pre-release**. Open the newest
  one and tap the `apex-<version>-b<run number>.apk` file under **Assets**.
- Also available for 30 days as the artifact `apex-release-apk` at the bottom of the run page (a zip containing the APK).
- The run's **Summary** page lists the version, the file name, the package name, the signing certificate SHA-1 and
  SHA-256, the redirect address in use, any warnings and the exact next step.

The older workflow **Android CI** (`android.yml`, runs on every push) keeps building the test APKs. Its artifact
`apex-apks` holds `app-debug.apk` and `app-release-unsigned.apk`. Use the Release page for anything you install.

## Install (first time)

1. Download the `.apk` from the Releases page.
2. Tap it. If Android asks, allow installing from this source ("Install unknown apps") for the browser or Files app,
   then go back and tap **Install**.
3. Play Protect may say the developer is unknown. Choose **Install anyway**: the app is signed with your own key, not
   a Play Store key.
4. Open Apex. Follow `docs/SETUP.md` section 7.

## Debug versus release

| | Debug (`app-debug.apk` from Android CI) | Release (Releases page) |
|---|---|---|
| Signed with | a new random key on every CI run | your stable key (derived from your signing password) |
| Install over the previous build | No: Android refuses (different signature) | Yes, and local data is kept |
| Sign in with Google | Only with an iOS-type client; an Android-type client (the fallback) can never match, since the fingerprint changes every run | Works once the client ID is built in |
| Optimised and shrunk | No, slower, larger | Yes (R8) |
| Use it for | developer checks only | everyday use |

Never mix them on one phone: debug and release have the same package name but different signatures, so you would
have to uninstall one to install the other.

## Which client type a build uses

`oauth_client_type` on the workflow (default **ios**, fallback **android**) decides how Google's sign-in returns to the
app. `ios` uses the reversed client ID (`com.googleusercontent.apps.<id>:/oauth2redirect`) and needs no fingerprint;
`android` uses the package name (`com.apex.athlete:/oauth2redirect`) and needs a client created with the SHA-1 from
the run summary. Google states that custom URI schemes are not supported for Android-type clients; the iOS type is not
contradicted but has not been tried from an Android browser tab (`UNVERIFIED-NEEDS-REAL-ACCOUNT`). The type and client
ID must match the client you created, and the summary shows the redirect address in use.

## How updates keep your data

Android lets a new APK replace an installed app only when both have the same package name (`com.apex.athlete`), the
same signing certificate and a version code that is not lower. A replace keeps the app's private storage, which
holds your encrypted database, settings and sign-in. The workflow derives the certificate from your repository
secret `APEX_SIGNING_PASSPHRASE`, so it is identical on every run. To confirm, compare the **SHA-256** in the run
summary with the one from your first build: they must be the same.

The app's version code goes up only when the version in `app/build.gradle.kts` is raised. Re-running the workflow for
the same version produces another file named `-b<next number>.apk` with the same version code: Android normally
accepts installing it over the same version too (only a lower version code is refused).

If the passphrase secret is missing, the run uses a one-time key and says so at the top of the summary. That APK
cannot update an earlier install. Fix the secret first, run again, and uninstall the old app once if the signature
changed.

## Security model (honest version)

- The key is derived from the passphrase with PBKDF2-HMAC-SHA256 (1,000,000 iterations, fixed public salt), then a
  deterministic RSA-2048 key and a self-signed certificate with fixed fields. The code is in
  `.github/scripts/DeriveKeystore.java`; determinism is proved by `.github/scripts/check-derive-determinism.sh`, and
  the workflow refuses to use the passphrase path if the pinned test vector ever stops matching.
- The repository is public and the certificate is in every APK you publish. So an attacker can test guesses of your
  passphrase offline against the public certificate. The key is therefore only as strong as the passphrase: use 32 or
  more random characters from a password manager, not a word or a phrase. The workflow refuses passphrases shorter
  than 20 characters.
- Anyone who learns the passphrase can sign an APK that Android accepts as an update to your app. Treat it like a
  password. If it leaks, make a new one: the new key has a new signature, so uninstall once and reinstall.
- The passphrase lives only in the GitHub secret and your password manager. The workflow never prints it and masks
  the derived values. The keystore is made on the build machine for the run and deleted at the end; it is never
  committed or uploaded.
- Alternative with more control: create your own keystore once on any machine, and store four secrets
  (`APEX_KEYSTORE_B64` as base64 of the file, `APEX_KEYSTORE_PASSWORD`, `APEX_KEY_ALIAS`, `APEX_KEY_PASSWORD`). They take
  priority over the passphrase.

## Uninstall

Settings, Apps, Apex, **Uninstall** (long-press the icon, App info, Uninstall). This deletes Apex's local database,
settings and sign-in. Your data in Google Health, the Fitbit app and Health Connect is not affected, so a fresh
install can sync it again; Takeout archives need to be imported again. To remove Apex's access from the Google side
too: myaccount.google.com, Security, "Third-party apps with account access", Apex, Remove access.

## If something goes wrong

- "App not installed": the signature differs from the installed app. Compare the SHA-256 values; uninstall once if they
  differ, then keep the same passphrase from then on.
- A run turns red: open it and read the red step. A malformed client ID is reported at the first step; a missing or
  too-short passphrase is reported at "Prepare signing key".
- Sign-in problems: `docs/SETUP.md` section 11.
