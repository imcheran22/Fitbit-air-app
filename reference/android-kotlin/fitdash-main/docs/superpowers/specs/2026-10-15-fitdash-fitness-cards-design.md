# fitdash v0.6 — design: fitness cards from published formulas

Date: 2026-10-15
Status: draft, for review
Builds on: `2026-10-12-fitdash-v0.5-design.md`. Everything there stays unless changed here.

## Goal

Add a Fitness section to Trends with cards computed only from published, citable formulas, each with an info button that shows the formula, the exact inputs used and the source. No proprietary "biological age" model. Every card is hidden or shows a short "what to add" note when an input is missing. Nothing is a diagnosis; every sheet ends with "General guide, not medical advice."

Also in this release: the first-run and empty-state work already in the working tree (device-neutral copy, No data screen with installed-app buttons and the phone-only option, Soft dropdown fix).

## Decisions

| Topic | Decision |
|---|---|
| Name | "Fitness age", never "biological age". |
| Gender | New setting, label "Gender", options Female, Male, Not set. Stored as `gender` (`FEMALE`, `MALE`, or absent). The sheet says the studies grouped people by sex at birth; pick whichever matches your physiology. |
| Birth year | Reused. Stepper already exists under Heart-rate zones. The Gender row sits beside it. |
| Missing inputs | A card still renders, with "Add gender in Settings" or "Add birth year in Settings" as its note and a tap that opens Settings, matching the BMI tile today. Cards needing data the watch never wrote (for example resting HR) do not render. |
| Section placement | "FITNESS" above "BODY" on Trends. Hidden by the existing "Body on Trends" toggle, which is relabelled "Body and fitness on Trends". |
| VO2 max | If the watch writes VO2 max, that value stays in the Heart section and the estimate card is not shown. Otherwise the estimate card shows. |
| Sources | Each formula cites one paper or standard whose equation was checked against an open copy at design time. The citation text lives next to the formula in code, in one `Source` object, so the sheet and tests share it. Nothing ships on a remembered coefficient. |

## Formulas

All in `metrics/Fitness.kt`. Pure functions. Inputs are plain numbers; the caller resolves them from the snapshot and settings.

Shared types:

```kotlin
enum class Gender { FEMALE, MALE }

data class Source(val title: String, val citation: String)

data class Explanation(
    val formula: String,                 // the equation, written out with symbols
    val inputs: List<Pair<String, String>>, // ("Resting HR", "58 bpm") in the order used
    val source: Source,
)

data class FitnessValue<T>(val value: T, val explanation: Explanation)
```

### Fitness age

Jackson et al. 1990, "Prediction of functional aerobic capacity without exercise testing", Med Sci Sports Exerc 22(6):863–870. The BMI model, as published:

VO2max = 56.363 + 1.921 × PA-R − 0.381 × age − 0.754 × BMI + 10.987 × G, where G is 1 for men and 0 for women.

PA-R is the NASA/Jackson physical activity rating, 0 to 7. fitdash derives it from the last 28 days:

| PA-R | Published description | fitdash rule, per week |
|---|---|---|
| 0 | avoids walking or exertion | under 3 000 steps a day and no workouts |
| 1 | walks for pleasure, uses stairs | 3 000–7 000 steps, no workouts |
| 2 | 10–60 min activity | workouts under 60 min, or over 7 000 steps |
| 3 | over 1 h activity | workouts 60–90 min |
| 4 | run under 1 mile or 30 min activity | workouts 90–150 min, or 10 000+ steps with any workout |
| 5 | run 1–5 miles or 30–60 min | workouts 150–240 min |
| 6 | run 5–10 miles or 1–3 h | workouts 240–420 min |
| 7 | run over 10 miles or over 3 h | workouts over 420 min |

Minutes are the mean weekly workout minutes over 28 days. The sheet shows the PA-R used and the rule that produced it.

Fitness age is defined against the same model: the age at which a person of your gender with the reference inputs (BMI 25, PA-R 3) would have your VO2max. Solving the equation for age: fitnessAge = (56.363 + 1.921 × 3 − 0.754 × 25 + 10.987 × G − VO2max) ÷ 0.381. Clamped to 18–90. Shown as a whole number with the delta to real age ("3 years younger"). The sheet states this definition in one sentence so nobody mistakes it for a clinical measure.

Inputs: age, gender, BMI (needs height and weight), PA-R. Resting HR is not used by this model. Missing: the card note says which input.

### VO2 max estimate

Uth et al. 2004, "Estimation of VO2max from the ratio between HRmax and HRrest", Eur J Appl Physiol 91:111–115.

VO2max = 15.3 × (HRmax ÷ HRrest), HRmax = 208 − 0.7 × age (Tanaka 2001, already in `maxHrForAge`).

Inputs: age, resting HR (28-day mean). Shown in ml/kg/min with no band word; the fitness age card carries the interpretation.

### Resting calories and daily need

Mifflin et al. 1990, "A new predictive equation for resting energy expenditure in healthy individuals", Am J Clin Nutr 51:241–247.

- Men: BMR = 10 × weight + 6.25 × height − 5 × age + 5
- Women: BMR = 10 × weight + 6.25 × height − 5 × age − 161

Daily need = BMR × activity factor from 7-day mean steps: under 5 000: 1.2, 5 000–7 500: 1.375, 7 500–10 000: 1.55, 10 000–12 500: 1.725, over 12 500: 1.9. The factors are the standard Harris-Benedict multipliers, cited as such.

Inputs: weight (latest), height, age, gender. Shown as "1 620 kcal at rest · 2 500 kcal/day".

### Sleep debt

Not a paper; the arithmetic is stated on the card. Debt = sum over the last 7 nights of max(0, goal − asleep hours). Shown in hours with one decimal. Band: under 2 h green, 2–5 h amber, over 5 h red. Source line: "Your sleep goal in Settings, last 7 nights."

### Training load

Gabbett 2016, "The training–injury prevention paradox", Br J Sports Med 50:273–280 (acute:chronic workload ratio).

Ratio = minutes of workouts in the last 7 days ÷ (minutes in the last 28 days ÷ 4). Needs at least 4 workouts in 28 days. Band: under 0.8 "easing off", 0.8–1.3 "steady", over 1.3 "ramping fast". Shown as the ratio with one decimal and the band word.

### Dropped: resting HR and HRV versus age

The population tables (NHANES resting pulse, Umetani RMSSD by decade) could not be verified from open sources at design time, so they are out. The existing "against your own baseline" comparisons on Today already cover this. Revisit if a verifiable table is found.

## Data flow

- `Settings.gender: Gender?` with storage key `gender`.
- `Goals` gains `birthYear: Int?` and `gender: Gender?` so `buildToday` can see them without a new parameter. `TodayViewModel` already maps settings to goals.
- `TodayData.fitness: FitnessData`:

```kotlin
data class FitnessData(
    val fitnessAge: FitnessValue<FitnessAge>?,
    val vo2Estimate: FitnessValue<Double>?,
    val calories: FitnessValue<Calories>?,
    val sleepDebt: FitnessValue<Double>,
    val trainingLoad: FitnessValue<TrainingLoad>?,
    val missing: Map<FitnessCard, MissingInput>, // card to the first missing input, for the tile note
)
```

- `fitness(snapshot, date, zone, goals)` in `metrics/Fitness.kt` computes everything from data already in the snapshot. No new Health Connect reads.

## UI

### Settings

Under Heart-rate zones, after the birth year stepper: a `ListRow` "Gender" showing the current value, opening a three-option dropdown (same component as Theme). "Body on Trends" toggle relabelled "Body and fitness on Trends", subtitle "BMI, body composition, fitness age and calories".

### Trends: Fitness section

`SectionLabel("FITNESS")`, then one full-width `SectionCard` for Fitness age, then a `TileGrid` for the rest in the order VO2 max est., Sleep debt, Training load, Resting kcal.

Card sizes vary on purpose. Fitness age is the hero: a full-width card with the number in the display type on the left, the delta word under it in the band colour, and on the right a 28-day curve of the estimate (one point per day, computed from that day's trailing 28-day inputs). Sleep debt and Training load are taller half tiles because their bodies carry a strip and a bar; VO2 and Resting kcal are the standard half-tile height. The grid already handles mixed heights within a row.

Every line in this section is drawn with the existing monotone smooth curve and gradient fill (`SmoothArea`), never the straight `GapLine`, so it matches the Trends charts above it.

Each tile is a `StatTile` with label, value, unit, note and a small body:

- VO2 max est.: body is a 28-day sparkline of the estimate, so a falling resting HR reads as a rising line.
- Sleep debt: body is a 7-segment strip, one block per night, filled in the band colour by that night's shortfall. Reuses the week-strip block drawing from Today.
- Training load: body is a small ratio bar with a marked 0.8–1.3 zone.
- Resting kcal: value "1 620", unit "kcal", note "2 500 kcal/day with your steps".

Note under each tile: "tap for the formula". A tile with a missing input shows the value "—", the note "Add gender in Settings", and opens Settings on tap, like the BMI tile.

### Colours

One accent per band, from the theme so Soft, Teal and Graphite each stay coherent:

- Good: `Palette.Green` (theme `good`).
- Middle: `Palette.Accent`.
- Watch: `Palette.Amber` (theme `warn`).
- Poor: the theme's `bad` colour, exposed as `Palette.Red` if not already.

Fitness age younger than real age is good, within 1 year middle, older is watch, 10 or more years older is poor. VO2 estimate has no band; its line uses the accent. Sleep debt and training load as given above.

Soft gets the same tinted-tile treatment as the Body tiles (sky, sage, lavender, peach in order), with the band colour only on the body element and the delta text, so the grid does not become a traffic light.

### Micro-interactions

Reuse existing primitives; nothing new in the animation layer.

- Tiles get `pressScale` and the haptic tick through the existing `StatTile` click path.
- Values count up on first appearance using the animated-number helper Today already uses. Fitness age counts from the real age to the fitness age, so the delta is visible as motion. Respects Reduce motion.
- The sleep-debt strip fills night by night, 60 ms apart, same stagger as the calibration dots.
- The training-load marker slides to its position over 400 ms with the standard easing.
- Opening a tile's sheet uses the existing bottom sheet; the formula block fades in 120 ms after the sheet settles so the value is read first.

### Info sheet

New `MetricRef.Fitness(card: FitnessCard)` in `MetricDetailSheet`. The sheet shows, top to bottom:

1. Title and the value in the display type, with the band word.
2. "How this is worked out": the formula on one line in monospace-ish numbers font, then a two-column list of inputs with the values used today.
3. "Source": title and citation, plain text, no link (the app has no internet permission; a user can search the citation).
4. "General guide, not medical advice."
5. For fitness age and resting calories: one sentence on gender, as decided above.

The Ask AI summary gains a "Fitness" block with the same numbers, so the share text matches the screen.

## Testing

Unit tests in `app/src/test/java/app/fitdash/metrics/FitnessTest.kt`:

- Each formula against a worked example: Jackson (40-year-old man, BMI 25, PA-R 3 gives 39.0, so fitness age equals real age), Uth (age 30, RHR 60 gives 47.7), Mifflin (70 kg, 175 cm, 30-year-old man gives 1 649), sleep debt, ACWR.
- PA-R derivation across every band edge in the table.
- Fitness age is a fixed point: feeding the reference inputs returns the real age for every age 18–90.
- Missing-input behaviour: every card reports the first missing input in the documented order.
- Explanation text: inputs listed in formula order, numbers formatted as shown on screen.
- `CopyTest` extended for the band words and the delta wording.

Device check before release: all three themes, Reduce motion on and off, a profile with no gender set, and the Soft dark variant.

## Out of scope

Waist circumference input, a sex-neutral blended formula, any formula without a public citation, the first-run intro and staged loader (separate spec if wanted).
