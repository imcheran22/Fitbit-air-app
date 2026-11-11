# Publishing fitdash on Google Play

A checklist for the person who holds the Play developer account. Package name: `app.fitdash`.

If a friend's account is used, the account holder is the publisher of record and is responsible for every declaration below (data safety, Health Connect, content rating). They should read them before submitting. The app can be transferred to your own developer account later (Play Console, Setup, Advanced settings, App transfer), so nothing here locks you in.

Google's console wording changes from time to time. Where this guide is unsure, it says so; trust the console over this file.

## Builds

There are two store flavours with the same application ID:

| Flavour  | Task                | Output | Buy me a coffee link |
|----------|---------------------|--------|----------------------|
| `github` | `assembleGithubRelease` | APK, attached to the GitHub Release | shown |
| `play`   | `bundlePlayRelease`     | AAB, attached to the GitHub Release as `fitdash-vX.Y.Z-play.aab` | hidden (Play's payments policy does not allow external donation links) |

Every `v*` tag builds both. Upload the `play` AAB to Play, never the APK.

## 1. Create the app

Play Console, Create app. Name `fitdash: Health dashboard` (the listing title is in `fastlane/metadata/android/en-GB/title.txt`, 30 characters maximum), default language English (United Kingdom), App, Free. Accept the declarations. The package name is fixed by the first upload: `app.fitdash`.

## 2. Play App Signing and the upload key

Opt in to Play App Signing (the default and, for new apps, mandatory). Releases are signed with an upload key; Google re-signs them with the app signing key.

The release workflow already signs with a local keystore, `~/.android/fitdash-release.jks`, with its alias and passwords in `~/.android/fitdash-release-credentials.txt`. Do not commit either file and do not paste the passwords anywhere.

Two ways to set this up:

- **Use that keystore as the upload key (default).** Google generates a separate app signing key. Export the certificate and, if the console asks for it, register it:
  `keytool -export -rfc -keystore ~/.android/fitdash-release.jks -alias <alias> -file upload_cert.pem`
  Consequence: the Play build and the GitHub APK are signed with different keys, so a user cannot update one over the other. They must uninstall first.
- **Use the same key as the app signing key.** In App integrity, App signing, choose to upload an existing key from a Java keystore and follow Google's PEPK instructions. Both channels then share one signature, and the certificate fingerprint published in the README stays valid. This cannot be undone; read Google's warnings first.

Pick one before the first upload.

## 3. First release, uploaded by hand

Download `fitdash-vX.Y.Z-play.aab` from the GitHub Release (or the `fitdash-play-aab` workflow artifact). In Testing, Internal testing, create a release and upload it. Automated uploads (step 10) only work after this manual first upload.

New personal developer accounts must usually run a closed test with at least 12 testers for 14 days before they can apply for production access. Check whether this applies to the account in use.

## 4. Store listing

Copy from `fastlane/metadata/android/en-GB/`:

| Console field | File |
|---------------|------|
| App name | `title.txt` |
| Short description | `short_description.txt` |
| Full description | `full_description.txt` |
| App icon (512 x 512) | `images/icon.png` |
| Feature graphic (1024 x 500) | `images/featureGraphic.png` |
| Phone screenshots | `images/phoneScreenshots/1.png` to `5.png` |
| Release notes | `changelogs/<versionCode>.txt` |

The screenshots are built from the mockups in `docs/screens`, which use sample data only. Never upload screenshots from a real device.

Category: Health & Fitness. Developer name: Mayur Rawte. Contact email: rawte.mayur@gmail.com. Website: `https://mayurrawte.is-a.dev/fitdash/`.

## 5. Content rating

Policy, App content, Content rating. Category: utility or reference. Answer No to violence, sexual content, language, controlled substances, gambling, user-generated content and location sharing. The app has no social features and no ads. Expect an "Everyone" style rating.

## 6. Target audience

18 and over only. Do not select any age group under 18. The app is not designed for children, so the Families policy does not apply.

## 7. Data safety form

Answers, based on the app having no internet permission and no network code:

| Question | Answer |
|----------|--------|
| Does your app collect or share any of the required user data types? | No |
| Data collected | None |
| Data shared | None |
| Is all of the user data encrypted in transit? | Not applicable. If the console still asks, answer that data is not encrypted in transit because no data is transmitted. |
| Can users request that data be deleted? | Not applicable, no data is collected. Uninstalling removes everything the app holds. |
| Security practices: independent security review | No |

Ask AI and Share day. Both build text or an image on the device and open the Android share sheet. The user picks the destination, and fitdash itself sends nothing.

Uncertainty to check: Google defines "collect" as data transmitted off the device by the app, and "share" as transfer to a third party. Google's guidance says a transfer the user starts themselves is not "sharing" in this sense, but it describes this under specific conditions (user-initiated, expected by the user, and so on). Read the current definitions in the Data safety help page and decide whether the account holder is comfortable with "No". If in doubt, the conservative answer is to declare Health and fitness data as shared, optional, user-initiated, purpose App functionality. Also confirm that Health Connect data read only on the device does not count as "collected"; Google's definition says it does not.

### 0.9.0 notes

The Play build reads Health Connect data and writes only water and height. Journal tags and your name stay on the phone. CSV export leaves the phone only when the user shares the file. The answers in the table above do not change.

The Health Connect read and write permissions still need their own declaration, below.

## 8. Health Connect declaration

Policy, App content, Health apps and Health Connect. Play asks for a justification for each permission the manifest requests. Suggested wording, one sentence each, taken from where the app uses the data:

Sleep and recovery
- Sleep: shows last night's score, duration, time in bed and stages on the Sleep page and the Sleep row on Today.
- Heart rate variability: shows HRV against your normal range on Today and in the Trends chart, and feeds the recovery score.
- Resting heart rate: shows resting heart rate against your normal range on Today and in Trends, and feeds the recovery score.
- Heart rate: finds the lowest overnight heart rate shown on the Sleep page, and estimates resting heart rate when the device does not record it.
- Oxygen saturation: shown in the Overnight vitals section of the Sleep page.
- Respiratory rate: shown in the Overnight vitals section of the Sleep page.
- Skin temperature: shown as a change from baseline in the Overnight vitals section of the Sleep page.

Activity
- Steps: shows daily steps, the hourly steps chart and goal progress on Today and Activity, and weekly steps in Trends.
- Distance: shows daily distance on the Activity page.
- Total calories burned: shows daily calories on the Activity page.
- Exercise: adds up exercise session time as Active minutes on the Activity page.

Write permissions (fitdash writes only the water and height you enter yourself, and never changes or deletes any other data). The GitHub build also writes nutrition (protein and caffeine).
- WRITE_HYDRATION: log water you drink from the Today page
- WRITE_HEIGHT: save your height, entered in Settings, used to calculate BMI

Background read (READ_HEALTH_DATA_IN_BACKGROUND)
- Off by default. Only requested when the user turns on Settings › Background refresh. Used every two hours to refresh the on-device cache and the home-screen widget so they show last night's sleep and today's steps without opening the app. Nothing is transmitted.

Other data tiles (shown only if you have data, as a tile in the Other data section of Trends, and included in the Ask AI summary)
- Weight, Body fat, VO2 max, Floors climbed, Active calories: each shown as a tile with its latest value and trend.
- Height, Body temperature, Hydration, Elevation gained: each shown as a plain tile with its latest value and trend.

The Play build declares exactly these 20 read permissions, plus READ_HEALTH_DATA_HISTORY, READ_HEALTH_DATA_IN_BACKGROUND and the two write permissions. `app/src/play/AndroidManifest.xml` removes the other 11 (blood glucose, blood pressure, nutrition, basal body temperature, bone mass, body water mass, lean body mass, basal metabolic rate, wheelchair pushes, power, speed), and the app only requests and shows data types whose permission is declared. The GitHub APK requests all 31.

Also provide the privacy policy link (step 9) and a short screen recording of the permission prompt if asked.

## 9. Privacy policy

Policy, App content, Privacy policy: `https://mayurrawte.is-a.dev/fitdash/privacy.html`

The page must stay publicly reachable. Check that it still describes Ask AI and Share day accurately.

## 10. Automated uploads to the internal track

Optional. The release workflow uploads the AAB to the internal track as a draft only if the secret `PLAY_SERVICE_ACCOUNT_JSON` exists. Without it the step is skipped.

1. Google Cloud console: create or pick a project, then IAM, Service accounts, Create. No project roles are needed.
2. On that service account, Keys, Add key, JSON. Download `key.json`.
3. Enable the Google Play Android Developer API for that project.
4. Play Console: invite the service account's email address as a user (Users and permissions) and grant it release permissions for `app.fitdash`. Older consoles do this under Setup, API access. Google moves this screen around.
5. Store the key as a repository secret, then delete the local file:
   `gh secret set PLAY_SERVICE_ACCOUNT_JSON < key.json`

The upload step passes no release notes. The upload action reads notes from `whatsnew-<locale>` files, not from the fastlane `changelogs/<versionCode>.txt` layout, so paste the notes into the console when promoting the draft.

## 11. Releasing

1. In `app/build.gradle.kts`, increase `versionCode` (it must go up on every upload to Play) and set `versionName`.
2. Add `fastlane/metadata/android/en-GB/changelogs/<versionCode>.txt` (500 characters maximum).
3. Commit, then tag and push: `git tag vX.Y.Z && git push origin main vX.Y.Z`.
4. The workflow publishes the APK and AAB to the GitHub Release and, if the secret exists, a draft to the internal track. Promote it in the console.
