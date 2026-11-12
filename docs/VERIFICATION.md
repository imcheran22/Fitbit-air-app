# Verification guide

How to check that Apex agrees with the official Fitbit app, stream by stream. Nothing here has been run against
a real band. Every item that needs a real band is marked `UNVERIFIED-NEEDS-REAL-BAND`; items that need a real
Google account are marked `UNVERIFIED-NEEDS-REAL-ACCOUNT`. Record results in `docs/API_VALIDATION.md` and
`docs/OPEN_POINTS.md`.

## Before you compare

1. Open the Fitbit app and let it sync. Note the time of the last sync.
2. In Apex open More, then "Data sources and diagnostics". Press "Sync now". Wait for "Finished ...". Check the
   stream list under "Diagnostics by stream" shows "Up to date" and a "Read up to" time close to the Fitbit
   app's sync time.
3. Compare complete past days first (yesterday, the day before). Today is still changing.
4. Use the same phone time zone in both apps.

## Expected differences, for every stream

- **One-minute buckets.** Apex stores heart rate as one-minute buckets (average, minimum, maximum, count). The
  Fitbit app may show finer points. Compare the shape and the daily min and max, not single seconds. The real
  sampling interval of the Fitbit Air is `UNVERIFIED-NEEDS-REAL-BAND`.
- **Time zone.** Days are cut at midnight in the phone's zone. Travel, daylight saving changeover days (23 or
  25 hours) and Takeout files without a time zone offset can shift a reading across midnight. Classic Takeout
  files are read in the zone the phone has at import time, Google-layout files as UTC
  (`docs/OPEN_POINTS.md`, Takeout point 2).
- **Source priority.** Two sources can describe the same minute. Apex keeps one value per slot and shows its source
  next to the number (`SourceReconciler`):
  1. Observed data beats estimated data.
  2. A value you typed beats an automatic reading.
  3. Between automatic sources, the finer sampling resolution wins when both are known.
  4. Otherwise a Takeout archive you imported wins for the days and metrics it covers; after that, the Google
     Health API for wearable metrics, and Health Connect for scales, cuffs and similar.
  5. The same source: the newer write wins.
  So a day can show a Takeout or Google value where the Fitbit app shows its own. Apex never adds two sources
  together.
- **Missing stays missing.** If the Fitbit app shows a number and Apex shows none, check "Diagnostics by stream"
  for a missing permission or a stream that never synced. Apex does not fill gaps.
- **Rounding and scores.** Apex scores (Recovery, Strain, Sleep) are its own calculations, not Fitbit scores.
  Do not expect them to match. Compare the raw readings underneath.

## Streams

Where to look in Apex: Health tab for readings, the sleep and workout screens for sessions, Data sources for sync
state. Time range: compare 3 full days, one weekday and one weekend day if you can.

| Stream | Compare in the Fitbit app | Time range | Expected differences | Status |
|---|---|---|---|---|
| Heart rate | Daily graph, daily minimum and maximum | 3 full days, plus one workout | One-minute bucketing; resting-period dips look smoother. Within a few bpm for the same minute | `UNVERIFIED-NEEDS-REAL-BAND` |
| Resting heart rate | Daily resting HR | 7 days | Fitbit computes its own value; Apex shows the source's value and names it. Small gaps if the night was short | `UNVERIFIED-NEEDS-REAL-BAND` |
| HRV | Daily value (RMSSD) in the app's heart or sleep view | 7 days | The daily summary and the detailed file can differ. Whether a Fitbit Air gives detailed samples or only daily values is unknown | `UNVERIFIED-NEEDS-REAL-BAND` |
| SpO2 | Overnight blood oxygen average, minimum | 3 nights | Minute-level versus daily average; some nights have none. Needs the band to report it | `UNVERIFIED-NEEDS-REAL-BAND` |
| Respiratory rate | Breathing rate during sleep | 7 nights | Sleep-only daily summary; no daytime value | `UNVERIFIED-NEEDS-REAL-BAND` |
| Skin temperature | Skin temperature change in the sleep or health view | 7 nights | Fitbit shows a change from your baseline; Apex decides absolute versus deviation by value range and labels it. Takeout temperature files' meaning is unconfirmed | `UNVERIFIED-NEEDS-REAL-BAND` |
| Sleep | Sleep time, stages (awake, light, deep, REM), start and end | 3 nights, include a nap if any | Stage minutes can differ by a few minutes; a night in two sources is merged by overlap, not duplicated; naps versus main sleep follow the source's flag | `UNVERIFIED-NEEDS-REAL-BAND` |
| Steps | Daily total | 7 days | Day cuts follow the time zone; Takeout steps need every minute present to write a day total, otherwise steps stay missing (Takeout point 3) | `UNVERIFIED-NEEDS-REAL-BAND` |
| Exercise | Each logged workout: start, duration, average heart rate | Last 5 workouts | Duration and zones follow the source of that workout; manual workouts you add are labelled self-reported | `UNVERIFIED-NEEDS-REAL-BAND` |
| VO2 max | Cardio fitness score | Latest value and 30 days | Apex shows the band's value when it reports one. Only when none exists does it show an estimate, always labelled Estimated, which will differ from Fitbit | `UNVERIFIED-NEEDS-REAL-BAND` |

Steps for each stream:

1. Open the stream in Apex and note the value, source label and day.
2. Open the same day in the Fitbit app and note its value.
3. If they differ by more than the differences above explain, check "Diagnostics by stream" for that stream
   (status, "Last success", "Read up to", failures in a row), then check the source label in Apex.
4. Run the check twice, once after a Google Health sync and once after a Takeout import, to see the source change.
5. Write down date, stream, both values and the source label.

## How to capture a diagnostics report

1. Open More, then "Data sources and diagnostics", scroll to "Diagnostics report" and press "Build report".
2. Read the preview. It starts with "Apex diagnostics (redacted, contains no health values)" and holds only app and
   phone versions, settings, permission and scope names, Health Connect writing-app package names (for example
   com.fitbit.FitbitMobile), the measured heart-rate sampling interval and coverage, per-stream row counts with first
   and last day, the last Takeout import's counts and redacted layout, and the database schema version. It has no
   health values, tokens, client ID, email, account name, file names or times finer than a day.
3. Press "Copy report" (then paste it into a message) or "Share report" (pick an app). Send that text back, plus a
   note of what you expected versus what you saw.
4. Run it after the first Google Health sync and again after the first Takeout import; the layout section appears
   once an import has finished. Heart-rate sampling is estimated from the stored one-minute buckets' sample counts,
   so the report also gives coverage (minutes present of minutes in 7 days).

If something in the preview looks personal, do not send it and report it as a bug. Screenshots are no longer needed
and should not be used for this.

## What never to share

- Access or refresh tokens, authorisation codes, or any URL containing `code=` or `state=`.
- Your OAuth client ID, signing keystore, keystore passwords, and the contents of `local.properties`.
- An Anthropic API key (AI coach).
- The Takeout ZIP, any file from inside it, or any raw export or database file from the phone.
- Screenshots showing your account email or identity details.

Apex logs no health values, tokens or secrets. If you ever see one in a log, treat it as a bug and do not paste the
log anywhere.
