# Apex setup guide

For the owner, not a developer. Follow the steps in order. Where a Google page may use different words than
written here, the guide says so. Status: parts marked `UNVERIFIED-NEEDS-REAL-ACCOUNT` were never run against a
real Google account (see `docs/OPEN_POINTS.md` and `docs/API_VALIDATION.md`).

## 1. What you need

- An Android phone with the Fitbit app installed and the Fitbit Air paired to it.
- A Google account that your Fitbit data is stored under.
- A phone browser and a free GitHub login that can open this repository on github.com. The app is built by GitHub
  (Actions), so you need no computer and no Android Studio. A computer path is in section 13 (appendix).
- About 45 minutes for the first setup (most of it waiting for builds).

You do not need to register a Fitbit developer app. The old Fitbit Web API (`api.fitbit.com`) is retired and
answers with a Google-style 401, so Apex does not use it (`docs/API_VALIDATION.md`). Apex reads from three
places only: the Google Health API, Health Connect, and a Google Takeout archive. You can use just one of them.
Takeout and Health Connect need no Google Cloud setup at all, so you can skip sections 3, 4 and 6 if you only want
those; you still need section 5 (the build and install; the client ID can be left empty).

## 2. Pair the band

1. Open the official Fitbit app on the phone and pair the Fitbit Air as the app asks.
2. Open the Fitbit app and let it sync. Apex reads what the Fitbit app has already synced. If the Fitbit app is
   behind, Apex is behind too.

## 3. Google Cloud Console on the phone

`UNVERIFIED-NEEDS-REAL-ACCOUNT`: nothing in sections 3 to 6 has been run against a real Google account yet. Google's
pages may use different words than written here; follow the meaning.

Which kind of sign-in client? Google's page on native-app sign-in says custom URI schemes (the kind of redirect Apex
uses) are **no longer supported for Android-type clients**. It does not say that about **iOS-type** clients, so the main
path below uses an iOS-type client, which also needs no fingerprint. Whether an iOS-type client really works from an
Android browser tab has not been tried: `UNVERIFIED-NEEDS-REAL-ACCOUNT`. If it fails, section 6 has the Android fallback.

1. On the phone open Chrome and go to `console.cloud.google.com`. Sign in with the same Google account as your Fitbit.
   The console is made for large screens: in Chrome open the three-dot menu and tick **Desktop site**. Zoom in with two
   fingers when the text is small.
2. Create a project: tap the project picker at the top, then **New project**. Name it anything, for example "Apex", and
   tap **Create**. Make sure the new project is the selected one afterwards.
3. Turn on the Google Health API: open the menu, **APIs & Services**, **Library**, search for "Google Health API", open
   it and tap **Enable**.
4. Set up the consent screen. Open **APIs & Services**, **OAuth consent screen** (newer consoles call it **Google Auth
   platform**, with the parts Branding, Audience and Data Access). Choose:
   - User type **External**. Publishing status stays **Testing**.
   - App name "Apex", and your own e-mail address as support and developer contact.
   - **Test users**: tap **Add users** and add your own Google account address. Only listed accounts can sign in.
5. Add the four read-only scopes (Data Access, or "Add or remove scopes"). Paste each into the filter box, or use
   "Manually add scopes". These are exactly what Apex requests and nothing else:
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
   - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
   - `https://www.googleapis.com/auth/googlehealth.settings.readonly` (only for the "Fitbit Air" row on Data sources: battery, last sync, model)

   Google may mark these sensitive or restricted. For one personal account in Testing mode, listing yourself as a test
   user is the intended route. Whether Google needs any review for these scopes is not confirmed.

## 4. Create the sign-in client (iOS type)

1. In Google Cloud Console: **APIs & Services**, **Credentials**, **Create credentials**, **OAuth client ID**
   (newer consoles: **Google Auth platform**, **Clients**, **Create client**).
2. Application type **iOS**. Name "Apex". Bundle ID `com.apex.athlete`. Leave any App Store ID or Team ID empty if
   the form allows. Apex uses no client secret. Tap **Create**. (The name "iOS" is only Google's label for this kind of
   client; it works for the Apex Android app because Apex only needs the redirect address it gives.)
3. Copy the **Client ID**. It ends in `.apps.googleusercontent.com`. It is not a secret (it is inside every copy of the
   app), but do not post it publicly for no reason. In Testing mode only the test users you listed can sign in anyway.

## 5. Signing password, build, install and sign in

Android only installs an update over an app if both builds are signed with the same key. Apex makes its key from one
password (a "passphrase") that you keep, so every build you ever make has the same signature and an update keeps your
data. Set it up before the first build you intend to keep. You do this once.

1. Make a password. In your phone's password manager (Google Password Manager, Bitwarden, 1Password, ...) choose
   "Create password" or "Generate", set the length to **32 characters or more**, with letters and digits, and save it
   under a name like "Apex signing passphrase". It must be long and random: this repository is public, so anyone can
   try to guess the password against the public certificate. A short or ordinary password is not safe. Store it
   safely. If you lose it you can make a new one, but the new key has a different signature and the old app must be
   uninstalled first (its local data is lost).
2. In the browser open this repository on github.com (three-dot menu, tick **Desktop site** if the Settings tab is
   missing). Go to **Settings**, **Secrets and variables**, **Actions**, **New repository secret**.
   - Name: `APEX_SIGNING_PASSPHRASE` (exactly)
   - Secret: paste the password. Tap **Add secret**.

   GitHub never shows the value again and hides it in build logs. Do not put the password in an issue, a file or a
   chat. (If you already have an Android keystore you would rather use, add the four secrets
   `APEX_KEYSTORE_B64`, `APEX_KEYSTORE_PASSWORD`, `APEX_KEY_ALIAS`, `APEX_KEY_PASSWORD` instead; they win over the
   passphrase.)
3. Save the client ID from section 4 as a repository **variable** (it is not secret): **Settings**, **Secrets and
   variables**, **Actions**, tab **Variables**, **New repository variable**, name `APEX_GOOGLE_CLIENT_ID`, value the
   client ID. Then ask Claude to "build the release". (The **Run workflow** button only appears for workflows on the
   repository's default branch, so a build is started by changing `.github/release-request.txt` on the working branch;
   Claude does that for you.) It takes about 10 to 20 minutes.
4. When the run is green open it and scroll to the **Summary**. It must not start with a warning about a "ONE-TIME
   signing key" (that means the secret in step 2 is missing or misspelled) or "NO GOOGLE CLIENT ID". It lists the
   redirect Apex uses (`com.googleusercontent.apps.<id>:/oauth2redirect`) and the signing certificate fingerprints.
   Note the SHA-256 value: every later build must show the same one, or it cannot update the installed app.
5. Open the repository's **Releases** page on github.com. Builds started by hand are listed as **Pre-release**. Open the
   newest one, scroll to **Assets** and tap the file named `apex-<version>-b<number>.apk`. (Or download the artifact
   `apex-release-apk` from the run page; it is a zip.)
6. Tap the downloaded file. Android asks to allow installing from this source ("Install unknown apps"): allow it for
   your browser or Files app, go back and tap **Install**. Play Protect may say the app is from an unknown developer;
   choose **Install anyway**. The app is signed with your own key, so this warning is normal. Later builds install
   over the old one and keep your data (`docs/RELEASES.md`).
7. Open Apex and see section 7 for the first launch. At "Sign in with Google" a browser tab opens. Choose your account.
   While the consent screen is in Testing, Google may say it has not verified the app: choose **Continue**. Tick every
   permission box and continue. The browser returns to Apex. Then grant Health Connect (section 8).
8. If Apex says "Apex has no Google client ID yet" or "Not set up", that build had no client ID: repeat step 3.
   If Google rejects the sign-in page, see section 6.

## 6. If Google rejects the iOS client: the Android fallback, and the 7-day limit

`UNVERIFIED-NEEDS-REAL-ACCOUNT`. Google states that custom URI schemes are not supported for Android-type clients, so
this fallback may be rejected too (with "Custom URI scheme is not supported on Android or Chrome apps"). It is kept
because the iOS type has never been tried from an Android browser tab, and one of the two may work. This one needs the
signing certificate's SHA-1, which only a build signed with your stable key can give.

1. Use the Summary of any green run made after you added the passphrase secret (section 5, step 2): long-press the
   **Signing certificate SHA-1** value (`AB:CD:12:...`) and copy it. If the Summary warns about a "ONE-TIME signing key",
   fix the secret first and run again; that SHA-1 is useless.
2. In Google Cloud Console create a second client, application type **Android**, name "Apex Android", package name
   `com.apex.athlete`, SHA-1 certificate fingerprint = the copied value. If the form has **Advanced settings** with a
   switch such as **Enable custom URI scheme**, turn it on (older notes of this project mention it; whether it exists
   and is needed is not confirmed). Create it and copy its client ID.
3. Run **Release APK** again with that client ID and `oauth_client_type` = **android**. The app then redirects to its
   package name, `com.apex.athlete:/oauth2redirect`. Install the new APK over the old one (same signature).
4. Whichever type works, write it in `docs/OPEN_POINTS.md` (section "Sign-in client type") so the default can follow.

Testing-mode limit: Google expires sign-ins after 7 days while the consent screen is in Testing. Apex then shows
"Sign in again". Sign in again each week, or set the consent screen to In production.

## 7. First launch

1. Open Apex. The welcome screen offers "Set up with my data" and "Explore with demo data".
2. "Set up with my data" asks for a few optional basics (birth year, sex, height, weight), then "Connect your
   data". Choose at least one source to continue: Google Health ("Sign in with Google"), Health Connect
   ("Allow reading"), or a Takeout archive ("I will import an archive"). You can add the others later under
   More, then "Data sources and diagnostics".
3. Sign in with Google: a browser tab opens. Choose your account. Tick every permission box. If you leave one
   unticked Apex says "Connected, but N permission was not ticked" and some data stays missing; sign in again to
   fix it. After "Connected. The first sync has started." the first sync runs.

## 8. Health Connect permissions

1. Health Connect must be installed (built in on Android 14 and later, a Play Store app before that).
2. In Apex choose "Allow reading" (onboarding) or "Grant permissions" (Data sources). Allow every item. Apex asks
   for read permission only and never writes. The items are heart rate, resting heart rate, heart rate
   variability, sleep, blood oxygen, breathing rate, skin temperature, steps, exercise, calories (total),
   VO2 max, floors and distance.
3. Two extra read permissions: "Older history" (without it only about 30 days before the first grant can be
   read) and "Background reads" (without it sync only reads while Apex is open). The phone may not offer them;
   Data sources then says "Not offered by this phone".
4. In the Fitbit app, turn on the sharing to Health Connect, if it is not already on. The Fitbit app's menu may
   word this differently. `UNVERIFIED-NEEDS-REAL-BAND`: what the Fitbit app writes to Health Connect for the
   Air has not been confirmed.

## 9. Request a Google Takeout Fitbit export

This brings in your full history. It reads the archive on the phone and uploads nothing.

1. On a computer or the phone browser, open `takeout.google.com` and sign in with the account your Fitbit uses.
2. Deselect everything, then select only Fitbit. The page may word this differently ("Deselect all").
3. Choose Next step. Choose the delivery method that suits you (a download link by email is simplest).
4. Choose the file type ZIP. TGZ cannot be read ("This looks like a TGZ file, which Apex cannot read").
5. Choose a file size. Large exports can be several gigabytes. Google may split into several ZIP files; that is fine.
6. Choose Create export and wait for the email. This can take hours or days.
7. Download all parts to the phone.
8. In Apex open More, then "Import Takeout archive". Press "Choose archive files" and pick one ZIP, or every part of
   a split export at once.
9. The import runs in the background, can take a long time, and can be cancelled ("Cancel import"); work done so
   far is kept and the next import resumes. Importing the same archive again is safe.
10. "Re-import everything" re-reads every file; use it only if something looked wrong.

Apex only opens files it recognises by name (last path segment, any letter case). Classic layout:
`heart_rate-YYYY-MM-DD.json`, `resting_heart_rate-YYYY-MM-DD.json`, `steps-YYYY-MM-DD.json`,
`sleep-YYYY-MM-DD.json`, `exercise-N.json`, and CSV files named `Heart Rate Variability Details - DATE.csv`,
`Daily Heart Rate Variability Summary - DATE.csv`, `Daily Respiratory Rate Summary - DATE.csv`,
`Minute SpO2 - DATE.csv`, `Daily SpO2 - DATE.csv`, `Device Temperature - DATE.csv`,
`Computed Temperature - DATE.csv`. Google layout: `heart_rate_DATE.csv`, `steps_DATE.csv`,
`oxygen_saturation_DATE.csv`, `daily_resting_heart_rate.csv`, `daily_heart_rate_variability.csv`,
`daily_oxygen_saturation.csv`, `daily_respiratory_rate.csv`, `daily_sleep_temperature_derivations.csv`.
Everything else (profile, location, messages) is never opened. `UNVERIFIED-NEEDS-REAL-ACCOUNT`: these names come
from descriptions, not from a real archive. Importing is off in Demo mode.

How repeats are handled (DECISIONS D6): each file is identified by category, name (which holds the date), size and
CRC-32. A file that did not change is skipped; a revised day is imported again.

## 10. Demo mode

Choose "Explore with demo data" on the welcome screen, or use More, then Settings, section "Demo mode". Demo
data is synthetic and lives in a separate store. Sign-in, sync and Takeout import are off while it is on. Turn it
off with "Turn off demo mode"; your real data is untouched.

## 11. Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| Data sources: "Failed: a permission is missing", or stream "Missing permission"; a 403 from Google. The error names the scope when Google or Apex can tell which | A Google permission box was unticked at sign-in, or the Google Health API is not enabled for the project | Data sources, "Sign in again", tick every box. Check the API is enabled (section 3, step 3) and the four scopes are on the consent screen (step 5). If only the "Fitbit Air" row says to reconnect, the sign-in predates the settings scope: sign in again |
| "Google ended this sign-in. If your Google Cloud consent screen is still in Testing, Google expires sign-ins after 7 days." (this is `invalid_grant`, a refresh the server rejects) Also "Google no longer accepts this sign-in" | Testing-mode 7-day expiry, a revoked grant, or a changed client | Press "Sign in again". For a lasting fix set the consent screen to In production |
| "Google rejected this app's client. Check the client ID and that your account is listed as a test user" | Wrong client ID, or account not a test user | Re-check section 3 step 4 (test user) and section 4, run Release APK again with the correct ID, sign in again |
| "The client ID saved in Settings needs the redirect scheme ... but this build uses ..." | An iOS-style build (the default) was made with another ID (with the Android fallback the scheme never depends on the ID) | Run Release APK again with this ID, install the new APK; or clear the Settings field |
| Google page: "Custom URI scheme is not supported on Android or Chrome apps" or `redirect_uri_mismatch` | Google does not accept the Android client with this redirect | If you used the Android client: section 4 (iOS client), then run again with `oauth_client_type` = ios. If you used the iOS client: section 6 (Android fallback) |
| "Apex has no Google client ID yet" or "Not set up" | No ID compiled in | Section 5 step 3 (run Release APK with the ID) |
| Installing says "App not installed" or "conflicts with an existing package" | The new APK was signed with a different key than the installed app (for example a one-time key, or a new passphrase) | Compare the SHA-256 in the run summary with the earlier one. If they differ, uninstall Apex (local data is lost, your data in Google and Health Connect is safe) and install again; then keep the same passphrase |
| Screens say no data, "None yet", streams "Never synced" | No sync has run, no permission, the band has not synced to the Fitbit app, or the date range has no data (a 404 or empty answer means no data, not an error) | Open the Fitbit app to sync, then Data sources, "Sync now". Check "Diagnostics by stream" |
| Band not syncing: data stops at an old time, stale data alert | The Fitbit app has not pulled from the band or is blocked in the background | Open the Fitbit app, check Bluetooth is on and the band is in range, let it sync, then "Sync now" in Apex. Apex can only read what the Fitbit app has synced |
| "Not available on this phone" or "Health Connect is not installed or not supported here" | Health Connect missing | Install it from the Play Store ("Open Play Store" in onboarding). "Needs an update": update it. Google Health sign-in still works without it |
| "Health Connect could not be opened from here" | The phone's Health Connect screen did not open | Open Settings, search "Health Connect", and grant Apex the permissions there |
| "Sync only reads while Apex is open", or sync is late or does nothing in the background | Battery optimisation, or the Background reads permission not allowed. Apex says background sync runs about every 30 minutes "when the phone allows it" | Set Apex battery use to Unrestricted. Samsung: Settings, Battery, Background usage limits, remove Apex from "Sleeping apps" and "Deep sleeping apps". Xiaomi: Settings, Apps, Manage apps, Apex, Battery saver, "No restrictions", and turn on Autostart. OnePlus and other OEMs: Settings, Battery, Battery optimisation, Apex, "Don't optimise", and allow background activity. Menus vary by phone and Android version, so they may be worded differently. Import and Fitbit app syncing can be limited by the same settings |
| "That does not look like a Takeout ZIP" | Wrong file, a folder, or a damaged download | Pick the downloaded `.zip` file itself |
| "This looks like a TGZ file, which Apex cannot read" | Export made as TGZ | Request again with ZIP |
| "The ZIP is readable but holds no Fitbit data Apex can use" | Not a Fitbit export, or file names Apex does not know | Request a new export with only Fitbit selected. Send back the redacted layout details described in `docs/OPEN_POINTS.md` (Takeout section) |
| "Import finished with some problems" | Damaged or cut-off files | Download the archive again and import it; imported data is kept |
| "Apex could not open the file" | File moved or the phone is short of space | Pick it again and free space |
| "Your data could not be opened" (store failed) | Encryption key lost, for example after a device restore | "Start clean" deletes the local database only. Your data in Google and Health Connect is safe, so sync or import again |

## 12. Known limits

- Google Health API rate limits are not published; the budget shown in Data sources is an assumption until
  measured (`UNVERIFIED-NEEDS-REAL-ACCOUNT`).
- Whether the Fitbit Air returns heart rate each second or each minute is unconfirmed
  (`UNVERIFIED-NEEDS-REAL-BAND`). Apex stores one-minute buckets either way.

## 13. Appendix: building on a computer (optional)

Only if you have a computer with JDK 17 or 21 and the Android SDK (or Android Studio). Not needed for the phone path.

1. Put the client ID in `local.properties` (git-ignored) as `apex.googleClientId=YOUR_ID.apps.googleusercontent.com`, or set
   the environment variable `APEX_GOOGLE_CLIENT_ID`. The file wins if both are set. Choose the client type with
   `apex.oauthClientType=ios` (default) or `android`, or `APEX_OAUTH_CLIENT_TYPE`. The build turns this into the redirect
   scheme: `com.googleusercontent.apps.<part before .apps.googleusercontent.com>` for `ios`, `com.apex.athlete` for
   `android`; the redirect address is that scheme followed by `:/oauth2redirect`. Rebuild after any change: both values are
   compiled into the app.
2. Debug builds: `./gradlew :app:assembleDebug` (JAVA_HOME set to JDK 17 or 21). The APK is in `app/build/outputs/apk/debug/`.
   Install with `adb install -r <file>` or from Android Studio. The debug key is created on that computer and is not
   the key of the GitHub builds, so the two cannot update each other.
3. SHA-1 of a local key: `./gradlew signingReport` (Windows PowerShell: `.\gradlew.bat signingReport`), line `SHA1:`.
4. Signed release on the computer: set all four values, otherwise the release stays unsigned. Each can be a line in
   `local.properties` or an environment variable:

   | local.properties key | environment variable |
   |---|---|
   | `apex.signing.storeFile` | `APEX_SIGNING_STORE_FILE` |
   | `apex.signing.storePassword` | `APEX_SIGNING_STORE_PASSWORD` |
   | `apex.signing.keyAlias` | `APEX_SIGNING_KEY_ALIAS` |
   | `apex.signing.keyPassword` | `APEX_SIGNING_KEY_PASSWORD` |

   The store file path is relative to the project folder. Never commit the keystore or passwords.
