# WIP — handoff

Last updated: 2026-11-01. Everything below is committed on `main`. Released: **v0.9.0** (tag `v0.9.0`, code 10, on GitHub; live on the Play internal track, sent for review on the closed Alpha track 29 Oct). Applied for production access 1 Nov. Site: https://mayurrawte.is-a.dev/fitdash/

## 1 Nov: applied for production access

All three criteria were ticked on the dashboard (closed release published, 12+ testers opted in, 14 days), and Mayur submitted "Apply for production" on 1 Nov. Google's review usually takes up to 7 days. Answers given: testers were friends and coworkers (some as a favour), recruiting was "Difficult", engagement mixed, feedback led to water logging and the v0.4 to v0.9 UI rework; audience is adults with a tracker, no ads, no account, data stays on the phone; expected installs 0–10K. The readiness answer claims Play vitals show no open crash issues, which was not checked before submitting; check Android vitals → Crashes and ANRs.

2 Nov: Mayur reports v0.9.0 is a good build; the device checks owed under 29 Oct are treated as done.

Until Google replies, do not edit the listing or declarations. After approval: promote v0.9.0 from Alpha to Production as a staged rollout, then rename the listing and replace the 0.4 screenshots.

## 29 Oct: v0.9.0 (code 10) released

The `redesign` and `polish-0.9` branches were merged into `main`, 263 unit tests pass, lint has no errors, both flavours build. Tagged `v0.9.0` and pushed; CI built the APK and Play AAB onto the GitHub release. Play: published to internal testing at 16:15, then promoted to Closed testing - Alpha and sent for review (quick checks, then Google's review, usually within 7 days). Production access: 12 testers opted in for 11 of the required 14 days on 29 Oct, so "Apply for production" should unlock around 1 Nov if nobody opts out. Shipped since v0.8.0: first-run name with a greeting and an initial avatar; dark mode (system, light, dark) with the widget following; a Log tab with instant water logging and journal tags (protein and caffeine on the GitHub build only); score chips that show what moved recovery, sleep and regularity, tappable to the metric; tag patterns on Trends after ten tagged days; a sleep debt chip and a bedtime target on Sleep; a weekly review on Today at the start of the week; an opt-in morning check for overnight vitals outside your usual range; a day timeline card on Today; CSV export of the daily table and raw data from Settings.

Polish in this release: the alert quotes the same usual range as the metric sheets and respects °F; the journal saves off the main thread and a damaged file no longer crashes the app; the splash follows the app's theme on Android 13 and later; the bedtime target appears after three nights.

Migration: existing users on the old Teal or Graphite themes now follow the system setting. The name step shows once after the update. On the GitHub build, protein and caffeine logged before the nutrition permission are written once it is granted.

Checked on the Pixel 9a (Android 16) in dark at the phone's font scale: installs over 0.8.0 with data kept, the name step shows once, Today, the timeline, the Sleep page, chips and the bedtime line render; a tap 8 dp above a chip opens its sheet. The check found two dark-mode bugs (bottom bar label leak, near-white day tiles) and the duplicate date control on Today; all three are fixed in this release but not yet re-checked on the phone. Still owed: light mode, 1.3 font scale, the dark splash with the phone in light, the week review "×", chip taps in the gap between rows and below the last row, the bedtime picker on a small screen.

## 26 Oct: v0.8.0 (code 9) released

The three branches below were merged into `main` (one import conflict in `TodayPage.kt`, both sides kept), 190 unit tests pass, lint has no errors. Tagged `v0.8.0` and pushed; CI built the APK and Play AAB onto the GitHub release. Play: published to internal testing at 22:57, then promoted to Closed testing - Alpha and submitted for review (quick checks, then Google's review). Not yet checked on a phone; Mayur will test the Play build.

Next, filed 26 Oct as issues and on the project board https://github.com/users/mayurrawte/projects/3: #22 bedtime reminder, #23 Sunday weekly recap notification, #24 morning readout as a notification, #25 monthly sleep profile, #26 a daily focus card on Today (the "looks stale after a few days" complaint). A medicine reminder was considered and dropped (no Health Connect data, off the calm-dashboard angle).

Open questions: the streak chips shipped in 0.8.0 go against "No streaks" in `docs/research/2026-10-16-behaviour-science-notes.md`; keep, soften or remove? Issues #17, #18 and #19 shipped in v0.7.1 but are still open.

What was on the branches:

- `loading-progress` (2 commits): the reader reports each record type as it lands; the first-run screen fills a ring around the orb with "Sleep · 7 of 24", and the sync row shows a small filling ring, then "Up to date ✓" for 2 s. Then microinteractions: MiniRing glides to new values, NumberWithUnits rolls numbers on change, pull-to-refresh haptic at the threshold.
- `reminders` (2 commits): Settings → Reminders. Water reminder (hourly worker, waking window from today's wake-up and the sleep goal, only when behind pace, 2 h apart, "+250 ml" action writes from a receiver) and Move nudge (needs background access; under 250 steps in the last hour with step data under 30 min old). Adds POST_NOTIFICATIONS. Then streak chips on Today (steps, sleep, water; milestones 3/7/14/21/30… pop once).
- `icon` (1 commit): option A, an ink ring with a glowing spark on a peach gradient squircle; splash and fastlane icon.png match. `docs/logo.png` still shows the old ring and the old name.

To check on the Pixel: number roll keeps the baseline with the units, the sync-row ring, whether the +250 ml write works from the background (Health Connect may refuse; it then says "Couldn't log water"), the icon under every launcher mask and as a themed icon.

Rename: display name to change (package stays app.fitdash); name not picked yet. Edit the Play listing only after applying for production (~1 Nov), as a title like "Name: Health & Sleep Dashboard". Research 26 Oct: Fitbit's move to Google Health (May 2026) lost Sleep Profile, badges, hourly move reminders and the stress number, which suggests positioning fitdash as the calm dashboard Fitbit users lost.

## v0.5.0 in the working tree, uncommitted

Spec: `docs/superpowers/specs/2026-10-12-fitdash-v0.5-design.md`. Implemented and unit-tested, not yet run on a device: workouts (rows, sheet, active minutes from sessions), heart-rate card and sheet, `READ_HEALTH_DATA_HISTORY` with a 6M trends view, blood pressure with diastolic, sleep efficiency / awakenings / latency, partial-day Movement delta, 11 sp type floor, 48 dp tap targets, drawn icons instead of text glyphs, 2-minute reload window on resume. Version bumped to 0.5.0 (code 5) with `changelogs/5.txt`.

Toolchain on this Mac: `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`, SDK at `/opt/homebrew/share/android-commandlinetools` (platform 37.0, build-tools 37.0.0). `local.properties` is git-ignored and points there.

Later the same evening, also in the working tree: Pastel, Techno and Sunrise removed (stored values fall back to Teal), redesigned sleep and steps headers (smaller arc, score colour, glowing tip, count-up), a stepped hypnogram with lanes, last-7-days week strip, press-scale and haptics on every tappable surface, animated trio numbers and water bar, theme crossfade, and new settings (24-hour time, lb, °F, reduce motion, haptics, which cards to show). Splash exit guarded against a null icon view (the v0.4.0 launch crash in logcat).

Device-checked so far on the Pixel (debug build, Graphite): first-run permission flow, Today, Sleep, Activity, Trends, Settings, workout rows and heart-rate card render with real Fitbit data; no crashes from the new build. After the UI pass, also checked on the Pixel: the new Sleep header and lane hypnogram, the steps gauge, the heart-rate card with sleep and workout shading, the Settings toggles. Still unchecked: 1.3x font scale, the workout sheet, Trends 6M after granting history.

Known: a full Health Connect read takes 20–30 s on this phone with 30 days of Fitbit minute-level heart rate (the loading orb shows that long on a cold start). Worth caching the snapshot on disk or using the changes API in v0.5.1.

Also in the tree now: an on-disk snapshot cache (instant open after the first run; incremental reads from two days before the last read, parallel per type, full read once a day), a "Data up to … · Sync Fitbit" row on Today that opens the wearable app and refreshes on return, a hero orb that shows sleep or steps while recovery calibrates, a four-tile glance grid replacing the trio, Settings → Feedback rows that open prefilled GitHub issues, and a backlog of 14 issues in `docs/issues/`, with `docs/issues/ISSUES.md` (all in one), `LINKS.md` (prefilled new-issue links) and `scripts/file-issues.sh` for a laptop where gh is logged in.

Latest pass (13 Oct, early): numbers typeface setting (Inter / Space Grotesk / Instrument Serif, OFL, bundled), Graphite mint accent, tiles without hairlines, Today restructure (orb 172 dp, action card under the glance grid, workouts folded into one expandable row, compact water row), and chart touch: tap shows a value for 2.5 s, press-and-hold then drag scrubs, on the heart-rate line and every bar chart.

Final pass (13 Oct): sleep score is now four parts (duration 50, efficiency 15, restoration 20, restfulness 15; duration alone without stages) and the sleep sheet shows them. All 7-day, 30-day and 6-month charts are smooth monotone curves with a gradient, dots, a goal line and tap readouts; hourly steps are pill bars. Calibration shows seven dots filling night by night. Status words are 12 sp. A one-night chart says "one day so far".

Not done: fresh Play screenshots from this build (`fastlane/.../phoneScreenshots` still shows 0.4 mockups; pad a 1080×2424 capture to 9:16 with `sips --padToHeightWidth 2424 1363 --padColor 050909`), the typeface picker, workout sheet and Trends 6M were not seen on the phone, and nothing is pushed.

## Soft theme (13 Oct evening, uncommitted, not run on a device)

A light pastel theme modelled on two Dribbble references, now the default for fresh installs (existing installs keep their saved theme and Inter numbers). It has a `#F2F3F0` ground, white 28 dp cards, tiles tinted sky, sage, lavender and peach (`Tint` + `TintScope` recolour the text inside), a dark icon-only dock in place of the glass nav, a peach week-strip pill and date chip, and a white hero card with a ring in place of the orb. Outfit (OFL, bundled) is used for body and labels on Soft and is a fourth numbers option. Status-bar icons go dark on Soft, and on Android 13+ the splash colour follows the theme from the next cold start. Two Soft previews are in `PagerScreen.kt`. To check on the Pixel: every page, every sheet (they use `bgMid`), the share card, chart dots and gauge tips on white, and labels that are still uppercased in code.

## Device check, 16 Oct (Pixel 9a, Play debug build of v0.7.0)

Checked and fine: first-run Health Connect flow (history prompt, then the permission sheet; 23 of 24 granted, background off by design), Today with the calibration countdown, Sleep page with the one-night line and the calibrating Regularity card ("4 of 5 night pairs"), Trends Fitness tiles (VO2 estimate after setting age, sleep-debt strip, training load marker), Settings Gender dropdown and Show sleep score toggle, score hidden on Sleep (hours with "calibrating" chip), the theme menu readable on Soft in dark mode (the v0.5 bug), Soft light and Soft dark, Midnight Teal.

Not checked: Fitness age and Resting kcal (no weight in Health Connect on this phone), the Regularity card past calibration and its sheet (needs a fifth night pair), Reduce motion, Graphite.

Noted: the "Grant access" button can look stuck after the Health Connect sheet returns, because the first full read takes 20–30 s with no change on screen until it finishes. The loading screen should take over as soon as permissions return. Also the Height tile on Trends shows "1.5 M" (a Health Connect value) while BMI says "Add height in Settings"; worth reconciling.

## Not yet checked on a device

- v0.5.0: everything above. Watch the first-run permission screen (now asks for "read older data"), the heart-rate card with Fitbit's 1-minute samples, the workout sheet, Trends 6M after granting history, and every page at 1.3x font scale with the larger labels.

- v0.3.0: tap any card to open its detail sheet; calmer Trends colours.
- v0.4.0: water card (+250 / +500, undo), height dialog, BMI tile, snackbar when a Health Connect write fails.
- Play build: the permission screen should list 20 permissions.
- Week strip: tapping a day should switch the date (failed once in testing).
- Before installing the release APK, uninstall the debug build (the signatures differ).

## Waiting on data

- The Fitbit Air has only written Sleep, Steps and raw heart rate so far. After a full night's sleep, open the Fitbit app, then check fitdash's ⓘ Data sources for HRV, SpO2 and resting heart rate. If they come through, tune `metrics/Tuning.kt`.

## Play status (18 Oct)

- v0.7.1 (code 8) is live on both the internal track and the closed "Alpha" track; Google approved the closed release within the hour on 18 Oct. Testers get it as a normal Play update.
- The dashboard shows the "at least 12 testers opted in" criterion met; the 14-day clock runs from about 17 Oct, so "Apply for production" should unlock around 1 Nov if the count holds. The tester list has 21 addresses.
- Installed audience was 4 devices as of 17 Oct (statistics lag a day or two). Nudge testers to install from the Play listing after opting in; the production criterion counts opt-ins, not installs.
- GitHub release v0.7.1 is published; `main` is pushed and in sync.
- Backlog is on GitHub as issues #3–#21 (`docs/issues/` is the archive). Next in order: accessibility pass (#16), visual system with new icon (#20, #14), if-then plan (#21), reminder (#12), Today hero with contributors (#5), journal tags (#8).
- Phone: the Pixel 9a has the v0.7.1 Play debug build with age and gender set; its screen timeout was raised to 10 min during the device check and not restored.

## Play (15 Oct)

Own personal developer account (SNX Studio). App `app.fitdash` created, all declarations and the store listing done, v0.5.0 (code 5) live on internal testing and on the closed "Alpha" track with the "fitdash testers" list (14 people added). Everything sent to Google for review on 15 Oct; reviews take up to 7 days. Production needs 12 testers opted in to the closed track for 14 days, then "Apply for production".

- Play App Signing uses a Google-generated key; the local keystore is the upload key. Play and GitHub builds therefore have different signatures.
- Back up `~/.android/fitdash-release.jks` and `~/.android/fitdash-release-credentials.txt` to a password manager.
- Do not edit the listing or declarations while the review runs; each edit restarts it.
- v0.7.1 (code 8, this tree): loading takeover after permissions (#17), baseline line and NSF sleep range (#18), morning readout and calibration countdown (#19).
- v0.7.0 (code 7, tagged, on GitHub): sleep regularity card, calm single-night framing, show sleep score toggle (`docs/superpowers/specs/2026-10-16-fitdash-sleep-regularity-design.md`). Research behind the roadmap: `docs/research/2026-10-16-behaviour-science-notes.md`.
- v0.6.0 (code 6, tagged, on GitHub): fitness cards (`docs/superpowers/specs/2026-10-15-fitdash-fitness-cards-design.md`), gender setting, No data screen with app buttons, device-neutral copy, Soft dropdown fix. Upload to the closed track after the review approves.

## Later

- Splash screen is always teal, so other themes flash teal before the app loads.
- MCP server (v3, opt-in, local Wi-Fi only).

## Release steps

Bump `versionCode` and `versionName` in `app/build.gradle.kts`, add `fastlane/metadata/android/en-GB/changelogs/<code>.txt`, tag `vX.Y.Z` and push the tag. Build with JDK 17.

The workflow's Play upload step is skipped because the repo has no `PLAY_SERVICE_ACCOUNT_JSON` secret. Upload by hand: download `fitdash-vX.Y.Z-play.aab` from the GitHub release, then in Play Console (account rawte.mayur, developer SNX Studio) Internal testing → edit draft → Add from library (or Upload) → release notes inside `<en-GB>` tags → Next → Save and publish. For Alpha: Promote release → Closed testing - Alpha → Next → Save → Publishing overview → Submit for review. The two warnings (no deobfuscation file, no native debug symbols) are expected.
