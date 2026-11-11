# fitdash backlog

Fourteen issues from the October 2026 review and forum research. One section per issue: title, labels, body. Paste each into a GitHub issue, or run `scripts/file-issues.sh` on a laptop where `gh` is logged in.

---

## 1. Home screen widget with recovery, sleep and steps

**Labels:** must-have, widget

Google Health's own widget shows "six numbers" for today with "no trend line", and users replace it within a week with widgets that show a sparkline, a sleep-stage breakdown and let them pick "only the ones I care about" (Android Police, May 2026).

**What to build**
- Glance widget in 2x2 (orb score + one line) and 4x2 (orb, sleep, steps, resting HR with 7-day sparklines).
- Tap opens the matching page.
- Refresh on a WorkManager schedule; needs `READ_HEALTH_DATA_IN_BACKGROUND`, declared and explained in the privacy page.
- Theme follows the app theme; optional Material You tint (see the dynamic colour issue).

**Why**
Retention. A dashboard app that is only seen when opened loses to one that is on the home screen.

Source: https://www.androidpolice.com/google-healths-home-screen-widget-bare-bones-replaced-with-better-widgets/

---

## 2. CSV export of the daily table and of raw series

**Labels:** must-have, data

Users export health data by hand every week ("eliminate the step of manually exporting to a CSV every Sunday", HN) and the most-voted Fitbit community thread on HRV is literally "Export Heart Rate Variability (HRV) Data".

**What to build**
- Settings → Data → Export: a CSV of the 30 or 180-day daily table (date, recovery, sleep score, hours, efficiency, awakenings, HRV, resting HR, steps, distance, calories, active minutes, water, weight) shared through the Android share sheet.
- A second option for raw series (heart rate samples, sleep stages, workouts) as separate CSVs in a zip.
- No internet permission involved; the file goes through FileProvider like the share image.

Sources: https://news.ycombinator.com/item?id=44661673 and the Fitbit community thread "Export Heart Rate Variability (HRV) Data".

---

## 3. Contributors for every score, Oura and Ultrahuman style

**Labels:** must-have, scores

Both reference apps explain each score with a list of named contributors (value, bar, status word). fitdash shows a single number plus two range tiles.

**What to build**
- Recovery: HRV balance, resting HR, sleep, plus skin temperature and respiratory rate when present.
- Sleep: total, efficiency, restfulness (awakenings), timing (bedtime drift vs 14-day median), HR drop (how early overnight HR bottomed), restoration (deep + REM share).
- Movement: steps, active hours (hours with 250+ steps, Ultrahuman's definition), calories, workouts. Replaces the plain step percentage.
- One shared row component: label, value, thin bar, status word; tap opens the metric sheet.

Spec reference: docs/superpowers/specs, v0.6 section of the review.

---

## 4. Explain missing data per watch instead of showing an empty tile

**Labels:** must-have, sync

Users with Galaxy Watch report HRV and SpO2 "inaccessible due to Samsung limitations" and ask for "clarity on why data isn't syncing when all permissions are given" (Sleep as Android forum, Samsung community).

**What to build**
- A per-source knowledge table: which types Fitbit, Samsung Health, Google Health, Garmin, Zepp and Huawei actually write to Health Connect.
- In Data sources, a one-line reason next to a granted-but-empty type: "Samsung Health does not share HRV with Health Connect" with a link to the vendor note.
- On the Today page, when recovery is calibrating because HRV is absent, say so explicitly rather than "night 1 of 7".

Sources: https://forum.urbandroid.org/t/health-connect-sync-not-working-for-hrv-and-spo2/12000, https://us.community.samsung.com/t5/Galaxy-Watch/Health-Connect-issues-with-HRV/m-p/3683948

---

## 5. Sync reminder and background refresh so the data is fresh when the app opens

**Labels:** must-have, sync

Wearable apps only push to Health Connect when they run: "data only appears after I open [the companion] app". v0.5 adds a "Data up to" line and a sync button; this issue is the rest.

**What to build**
- Morning notification (opt-in) at a chosen time when the latest data is older than N hours: "Your watch has not synced since 11 PM. Open Fitbit to sync." Tapping opens the companion app, and fitdash refreshes when the user returns.
- Background refresh of the cache every few hours with `READ_HEALTH_DATA_IN_BACKGROUND`, so a cold open shows last night without waiting.
- Both behind switches in Settings, both documented in the privacy page.

Source: https://forum.urbandroid.org/t/health-connect-sync-not-working-for-hrv-and-spo2/12000

---

## 6. Journal tags with correlations

**Labels:** good-to-have, insights

Whoop's most loved feature: tag a day (caffeine late, alcohol, late meal, illness, travel, screen in bed) and see "on alcohol days your HRV averages 12% lower". Entirely local.

**What to build**
- A tag sheet from the Today page, stored in app-private storage (not Health Connect).
- After 10+ tagged days, an Insights card on Trends: per tag, the mean difference in HRV, resting HR, sleep score and deep sleep against untagged days, with the sample size.
- Export tags with the CSV.

---

## 7. Weekly review card with week-over-week comparison

**Labels:** good-to-have, insights

Users want "weekly patterns rather than just today's numbers". Whoop and Garmin both deliver a weekly summary.

**What to build**
- On the first open of the week (or Sunday evening), a card on Today: average recovery, sleep, steps, active minutes, with the delta against the previous week and one sentence of plain-English summary.
- Trends gains a "This week vs last week" toggle on each chart.

---

## 8. Sleep debt, bedtime consistency and a bedtime target

**Labels:** good-to-have, sleep

Fitbit's Sleep Profile, Garmin's Sleep Coach and Whoop's Sleep Planner all centre on sleep need and consistency, not just last night.

**What to build**
- Sleep debt: rolling 14-day need (goal) minus slept, shown next to the sleep gauge.
- Bedtime consistency: standard deviation of bedtime over 14 days as a contributor and a line on the Sleep page.
- A bedtime target in Settings (default from the 14-day median), used by a gentle evening reminder (opt-in) and by the caffeine cut-off on the day timeline.

---

## 9. Day timeline with sleep, workouts, heart rate and caffeine cut-off

**Labels:** good-to-have, today

Ultrahuman's "Windows" view puts the day on one strip. fitdash already shades sleep and workouts under the heart-rate line; this makes it a first-class card.

**What to build**
- A 24-hour strip at the top of Today under the orb: sleep span, naps, workouts, heart-rate line, hourly steps density, and a caffeine cut-off marker 10 hours before the bedtime target.
- Tapping a span opens the matching sheet.

---

## 10. Morning out-of-range alert for overnight vitals

**Labels:** good-to-have, alerts

Apple Vitals and Oura's Symptom Radar notify when overnight metrics leave the user's normal range. fitdash already computes the ranges.

**What to build**
- Opt-in notification after the night is synced when resting HR, respiratory rate or skin temperature is outside the 30-day range, in the unhealthy direction, with the values.
- A matching card at the top of Today.
- Needs background read; shares infrastructure with the sync reminder issue.

---

## 11. Heart-rate zones per workout and zone minutes per day

**Labels:** good-to-have, activity

Oura added heart-rate zones for 30+ auto-detected activities in 2026; Fitbit users expect Active Zone Minutes.

**What to build**
- Zones from age-based max HR (or a user-set max) in Settings.
- Workout sheet: time in each zone as a stacked bar.
- Activity page: zone minutes for the day against a goal, as the "active minutes" alternative for users who prefer it.

---

## 12. Material You dynamic colour as a third theme

**Labels:** good-to-have, theme

The widget article singles out "Material You dynamic color" and "dynamic color adaptation matching wallpapers" as what users prefer in replacements for Google's widget.

**What to build**
- A "System" theme that builds the theme tokens from `dynamicDarkColorScheme` on Android 12+, keeping the app's own good/warn/bad semantics.
- Used by the app and the widget.

---

## 13. Cycle tracking module, opt-in

**Labels:** good-to-have, modules

Oura and Apple lead with women's health. Health Connect has menstruation period and flow records, plus basal body temperature.

**What to build**
- Opt-in module in Settings (off by default, not requested at first run).
- Cycle day and phase on Today, temperature trend on Trends, phase as a readiness note.
- Clear privacy copy; the data never leaves the device like everything else.

---

## 14. Accessibility pass: TalkBack order, 1.3x font scale, reduce motion by system setting

**Labels:** good-to-have, accessibility

fitdash now has 48 dp targets and an 11 sp floor; the remaining work is a full pass.

**What to build**
- TalkBack: a sensible reading order on every page, every chart with a text alternative (the heart-rate card reads "min 51, average 81, max 150").
- Every page checked at 1.3x and 1.5x font scale; gauges and tiles must not clip.
- Honour the system "remove animations" setting as well as the in-app Reduce motion switch.
