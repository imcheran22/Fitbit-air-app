# Apex setup guide

For the owner, not a developer. Follow the steps in order. Where a Google page may use different words than
written here, the guide says so. Status: parts marked `UNVERIFIED-NEEDS-REAL-ACCOUNT` were never run against a
real Google account (see `docs/OPEN_POINTS.md` and `docs/API_VALIDATION.md`).

## 1. What you need

- An Android phone with the Fitbit app installed and the Fitbit Air paired to it.
- A Google account that your Fitbit data is stored under.
- A computer with Android Studio, or JDK 17 or 21 and the Android SDK, to build the app.
- About 30 minutes for the first setup.

You do not need to register a Fitbit developer app. The old Fitbit Web API (`api.fitbit.com`) is retired and
answers with a Google-style 401, so Apex does not use it (`docs/API_VALIDATION.md`). Apex reads from three
places only: the Google Health API, Health Connect, and a Google Takeout archive. You can use just one of them.
Takeout and Health Connect need no Google Cloud setup at all, so you can skip steps 2 and 3 if you only want
those.

## 2. Pair the band

1. Open the official Fitbit app on the phone and pair the Fitbit Air as the app asks.
2. Open the Fitbit app and let it sync. Apex reads what the Fitbit app has already synced. If the Fitbit app is
   behind, Apex is behind too.

## 3. Create the Google sign-in (Google Cloud)

`UNVERIFIED-NEEDS-REAL-ACCOUNT`: the exact client type Google accepts for the redirect Apex uses has not been
confirmed. Step 3.5 gives the fallback.

1. Go to `console.cloud.google.com` and sign in with the same Google account.
2. Create a project (the project picker at the top). Name it anything, for example "Apex".
3. Turn on the Google Health API for the project: open the API library, search for "Google Health API" and
   choose Enable. The page may word this differently.
4. Set up the OAuth consent screen. Choose the External user type. Leave publishing status on Testing. Under
   test users, add your own Google account. The page may word these steps differently.
5. Add the four read-only scopes if the page asks for scopes (these are exactly what Apex requests):
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
   - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
   - `https://www.googleapis.com/auth/googlehealth.settings.readonly` (only for the "Fitbit Air" row on Data sources: battery, last sync, model)

   These may be marked sensitive or restricted by Google. For one personal account in Testing mode, adding
   yourself as a test user is the intended route. Whether Google needs any review for these scopes is not
   confirmed.
6. Create an OAuth client ID: Credentials, Create credentials, OAuth client ID. Choose the Android type, with
   package name `com.apex.athlete` and the SHA-1 fingerprint from step 4 below.
   Fallback: if Google refuses the app's custom-scheme redirect for an Android client, ask for the iOS type
   (bundle ID `com.apex.athlete`) instead. Apex uses no client secret. Record in `docs/OPEN_POINTS.md` which type
   worked.
7. Copy the client ID. It ends in `.apps.googleusercontent.com`. It is not a secret, but do not post it publicly.

Testing mode note: Google expires sign-ins after 7 days while the consent screen is in Testing. Apex then shows
"Sign in again". Sign in again each week, or set the consent screen to In production.

## 4. Get the SHA-1 fingerprint

1. In a terminal, in the project folder, run: `./gradlew signingReport` (Windows PowerShell: `.\gradlew.bat signingReport`).
   Set `JAVA_HOME` to JDK 17 or 21 first.
2. Find the variant `debug` and copy the line starting `SHA1:`.
3. If you later build a signed release (step 6), run the report again with the release key and register that SHA-1
   too. A debug build and a release build have different SHA-1 values.

## 5. Put the client ID in the app

1. Open `local.properties` in the project folder (it is git-ignored, so it never gets committed). Create it if
   missing.
2. Add one line:
   `apex.googleClientId=YOUR_ID.apps.googleusercontent.com`
   Alternative: set the environment variable `APEX_GOOGLE_CLIENT_ID`. The file wins if both are set.
3. The build turns the ID into the redirect scheme `com.googleusercontent.apps.<the part before .apps.googleusercontent.com>`.
   The redirect address Apex uses is that scheme followed by `:/oauth2redirect`. You do not enter this anywhere
   unless the Google page asks for it.
4. Rebuild after any change. The ID is compiled into the app. The Settings screen field "Google client ID" can
   hold an ID, but if its redirect scheme differs from the build's, Apex shows "This client ID needs the
   redirect scheme ... but this build uses ... Rebuild the app with this ID in local.properties".

## 6. Build and install

1. Run `./gradlew :app:assembleDebug`. It can take several minutes the first time.
2. The APK is in `app/build/outputs/apk/debug/`. Install it with `adb install -r <file>` or from Android Studio
   (Run).
3. Optional signed release build. Set all four values or the release stays unsigned. Each can be a line in
   `local.properties` or an environment variable:

   | local.properties key | environment variable |
   |---|---|
   | `apex.signing.storeFile` | `APEX_SIGNING_STORE_FILE` |
   | `apex.signing.storePassword` | `APEX_SIGNING_STORE_PASSWORD` |
   | `apex.signing.keyAlias` | `APEX_SIGNING_KEY_ALIAS` |
   | `apex.signing.keyPassword` | `APEX_SIGNING_KEY_PASSWORD` |

   The store file path is relative to the project folder. Never commit the keystore or passwords.

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
| Data sources: "Failed: a permission is missing", or stream "Missing permission"; a 403 from Google. The error names the scope when Google or Apex can tell which | A Google permission box was unticked at sign-in, or the Google Health API is not enabled for the project | Data sources, "Sign in again", tick every box. Check the API is enabled in step 3.3 and the four scopes are on the consent screen. If only the "Fitbit Air" row says to reconnect, the sign-in predates the settings scope: sign in again |
| "Google ended this sign-in. If your Google Cloud consent screen is still in Testing, Google expires sign-ins after 7 days." (this is `invalid_grant`, a refresh the server rejects) Also "Google no longer accepts this sign-in" | Testing-mode 7-day expiry, a revoked grant, or a changed client | Press "Sign in again". For a lasting fix set the consent screen to In production |
| "Google rejected this app's client. Check the client ID and that your account is listed as a test user" | Wrong client ID, or account not a test user | Re-check steps 3.4 and 3.6, rebuild with the correct ID, sign in again |
| "The client ID saved in Settings needs the redirect scheme ... but this build uses ..." | The build was made with another ID | Put the ID in `local.properties`, rebuild, reinstall |
| "Apex has no Google client ID yet" or "Not set up" | No ID compiled in | Step 5, then rebuild |
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
