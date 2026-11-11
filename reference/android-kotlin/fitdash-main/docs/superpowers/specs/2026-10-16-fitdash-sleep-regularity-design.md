# fitdash v0.7 — design: sleep regularity and calm sleep framing

Date: 2026-10-16
Status: draft, for review
Builds on: `2026-10-15-fitdash-fitness-cards-design.md`. Everything there stays unless changed here.

## Goal

Make sleep regularity the second headline of the Sleep page, because regularity predicts health outcomes more strongly than duration (Windred et al. 2023, UK Biobank, 60 977 adults; Cribb et al. 2023, eLife). And stop single nights from alarming people: sleep trackers can create sleep anxiety (Baron et al. 2017, "orthosomnia"), so one night never shows red and the copy says so.

Research summary that drives this spec: `docs/research/2026-10-16-behaviour-science-notes.md` (written as part of this work).

## Decisions

| Topic | Decision |
|---|---|
| Regularity metric | Sleep Regularity Index, SRI (Phillips et al. 2017, Sci Rep 7:3216): the probability that the person is in the same state (asleep or awake) at any two time points 24 hours apart, scaled to −100…100. fitdash shows it clamped to 0–100. |
| Window | Last 14 nights ending on the selected date. Needs at least 5 valid day pairs; below that the card says "calibrating, N of 5 nights". |
| Missing nights | A day with no main sleep session is excluded from pairing; it is not treated as "awake all night". |
| Naps | Count as asleep. SRI is about state, not the main sleep only. |
| Second number | Bedtime and wake-time spread: the standard deviation of bedtime and of wake time over the last 7 nights, shown as "bedtime ± 48 min". Simple, transparent, and what the user can act on. |
| Words | SRI ≥ 80 "very regular", 70–79 "regular", 60–69 "varies", under 60 "irregular". These bands are fitdash's design choice; Phillips reports a population mean near 80. The sheet says so. |
| Colours | Regularity uses the three-colour scale: good, middle, watch. Never red. |
| Calm framing | Any single-night sleep value (score, total sleep, efficiency, awakenings, restorative) that would map to `Status.ATTENTION` renders with the watch colour and the word "below your usual". Red stays for 7-day trends and for goals the user controls (steps, water). |
| Sleep word | `sleepWord` for a score under 50 becomes "Short night" instead of "Poor". |
| One-night copy | Under the Sleep gauge, one line: "One night on its own says little. Your 7-night average is 7h 20m." Shown only when the night is under the goal. |
| Show sleep score setting | New toggle "Show sleep score", default on. Off: the Sleep gauge shows hours asleep as the hero with the regularity word as its tag, Today's sleep glance tile shows hours, and the sleep-score tile in the week review is hidden. |
| Where it appears | Sleep page: a Regularity card under the span bar. Trends: a "Regularity" row in the week review. Today: no change beyond the toggle. |
| Info sheet | Tapping the Regularity card opens a sheet in the fitness-sheet style: value, word, how it is worked out, the inputs (nights used, pairs used, bedtime spread, wake spread), the citations, and the not-medical line. |

## Metric

`metrics/Regularity.kt`, pure functions.

```kotlin
data class Regularity(
    val sri: Int,                 // 0..100, clamped
    val nightsUsed: Int,          // days with a main session in the 14-night window
    val pairsUsed: Int,           // valid 24-hour pairs
    val bedtimeSpreadMin: Int?,   // SD of bedtime over the last 7 nights, null under 3 nights
    val wakeSpreadMin: Int?,
    val nights: List<NightSpan>,  // for the chart, oldest first, 14 entries, null where missing
)
data class NightSpan(val date: LocalDate, val start: Instant?, val end: Instant?)

fun regularity(sessions: List<SleepSession>, date: LocalDate, zone: ZoneId): FitnessValue<Regularity>?
```

Algorithm:

1. Window = the 14 dates ending on `date`. For each date find the main night (`nightEnding`) and any naps ending that date.
2. Build an asleep set at one-minute resolution covering from the earliest session start to the latest session end in the window: a minute is asleep if it falls inside any session.
3. A day pair is (t, t + 24 h) for every minute t on a date d such that both d and d + 1 have a main night. Count matches where state(t) == state(t + 24 h).
4. SRI = 200 × matches ÷ pairs − 100, rounded, clamped to 0…100. Null when valid day pairs are fewer than 5.
5. Bedtime spread: standard deviation in minutes of the main night's start clock time over the last 7 nights, handling midnight wrap by measuring each start as minutes from 18:00 of the previous evening. Wake spread the same from the end time. Null under 3 nights.

Explanation text: formula "SRI = 200 × (share of minute pairs 24 h apart in the same state) − 100", inputs "Nights used", "Pairs used", "Bedtime ± N min", "Wake ± N min", sources Phillips 2017 and Windred 2023, note "Bands are fitdash's choice: 80+ very regular, 70–79 regular, 60–69 varies, under 60 irregular."

Reuses `Source`, `Explanation`, `FitnessValue` from `Fitness.kt`.

## Data flow

- `TodayData.regularity: FitnessValue<Regularity>?` computed in `buildToday` from `snap.sleep`.
- `Settings.showSleepScore: Boolean = true`, key `showSleepScore`.
- `WeekReview` gains a `REGULARITY` row when SRI is available for this week and last week: this week's SRI versus last week's, same comparison style.
- `MetricRef.Fitness` gains `FitnessCard.REGULARITY`; `FitnessSheet` handles it. `FitnessSection` does not show it; it lives on the Sleep page.

## UI

### Sleep page

Under the span bar, before "Last night":

`SectionCard("REGULARITY", trailing = "last 14 nights · tap for the formula")` with:

- Left: SRI as the big number with the word under it in the band colour, and "bedtime ± 48 min · wake ± 35 min" in tiny type.
- Right: a 14-night chart, one row per night, a horizontal bar from bedtime to wake on a shared clock axis from 20:00 to 12:00. Missing nights are an empty row. Bars draw in with the existing stagger. On Soft the bars take the Sky tint ink.
- Calibrating state: "Calibrating · 3 of 5 nights" and a dot row like the recovery calibration.

Under the gauge, when the night is below goal: the one-night line in muted body type.

### Status rendering

`StatusText` and `NumberTile` take an optional `calm: Boolean`. When true, `ATTENTION` renders with `Palette.Warn` and the word "BELOW YOUR USUAL". All sleep tiles on the Sleep page and the sleep row on Today pass `calm = true`. The generic detail sheet for sleep kinds passes it too.

### Settings

"Show sleep score" toggle under "SHOW ON TODAY", subtitle "Off shows hours and regularity instead of a score".

### Micro-interactions

- SRI counts up with `CountUpText` on first show.
- Night bars stagger in at 40 ms per row, respecting Reduce motion.
- Tapping a night bar shows that night's times for 2.5 s, the same readout as chart taps elsewhere.

## Testing

`RegularityTest`:

- Identical nights for 14 days give SRI 100.
- Alternating 22:00–06:00 and 02:00–10:00 nights give SRI 33: states differ for 8 of every 24 hours (22:00–02:00 and 06:00–10:00), so matches are 16/24 and 200 × 16/24 − 100 = 33. The test documents this working.
- Under 5 valid pairs returns null.
- A missing night is excluded, not counted as awake: SRI with one missing night equals SRI without it.
- Bedtime spread across midnight: starts at 23:30, 00:30, 23:00 give an SD of 45 min, not 11 hours.
- Naps count as asleep.

`CopyTest`: regularity words and "Short night".

`StatusTest` or `CopyTest`: calm mapping word.

`WeekReviewTest`: regularity row present when both weeks have SRI.

Device check: Sleep page in all three themes, the calibrating state, the toggle off state on Today and Sleep.

## Out of scope

The if-then plan, the timed prompt, and the Today hero rework from the research notes. Each gets its own spec.
