# Information architecture: data map and tab reorganization

Status: proposal, 2026-10-17. This is the step before moving the whole app to the glow design language. Glow Today
(`ui/glow/GlowTodayScreen.kt`) is the starting point. How glow extends to the detail screens is decided after this.

## 1. What the app stores today

All tables are in `data/db/Entities.kt`; all are written by `device/HistorySync.kt`. "Shown" means a screen renders
it; "Used" means a computation reads it but no screen shows it directly.

### 1.1 Room tables

| Table (strap type) | Fields | Used by | Shown where | Gap |
|---|---|---|---|---|
| `heart_rate` (history + live) | ts, bpm, source | Day HR series, resting-HR estimate, Readiness, Energy, TRIMP load | Today (HR card + latest), Heart (day chart, low/avg/high), Sleep (HR during sleep, whole day toggle) | — |
| `activity_minute` (1) | ts, steps, intensity, kind, heartRate | Steps total + hourly, active hours, HR fallback, Energy states | Today (steps, hourly bars, active hours, Steps chip) | `intensity`, `kind` never shown; no steps history beyond today |
| `activity_extended` (88) | floors, run, fatBurn, stand, walk, sit, steps, calories, distanceCm | Day distance and calories (data step) | — | `distanceCm` confirmed as cm (≈ 75 cm a step on the strap). `sit/stand/walk/run` are one-hot flags per minute, not durations. Calories look like active kcal per minute; floors always 0 so far |
| `sleep_session` (sleep) | start, end, day, nap, score, avgHR, deep/light/rem/awake min, wakeCount | Main sleep + naps, Readiness (sleep, sleep balance), Narrative | Today (Sleep chip, overview arc, sleep card, naps), Sleep (hero, in bed vs asleep, contributors, woke N×), Recovery (sleep band on Energy) | No sleep trend (only "vs night before"); no bedtime consistency |
| `sleep_stage` | start, end, sessionStart, stage | Stage breakdown | Today (hypnogram), Sleep (hypnogram + stage rows), nap details | — |
| `spo2` (daytime) | ts, percent | 7-day baseline | Today (What changed), Heart (day chart) | — |
| `sleep_spo2` (38) | ts, percent | Readiness (Blood oxygen factor) | — | **Not shown.** Belongs on Sleep |
| `osa_event` (39) | ts, drop, 240 SpO2 + 240 HR bytes | Day state (data step) | — | One event on the strap so far, with `drop` = 128, which looks like a flag or signed value, not a % drop |
| `osa_result` (74) | belongTime, validTime, odiRaw, odiScore, dispCode, eventCount | Readiness (Breathing disturbances: eventCount → ODI), day state | Only as a contributor row on Recovery | No rows after two nights on the strap, so units are still unverified |
| `stress` | ts, value | Baseline, Energy (stress drain + threshold) | Today (chip, What changed), Heart (day chart) | Not tied to Energy visually |
| `hrv` | ts, ms | 7-day trend, baseline, Readiness (HRV balance) | Today (What changed), Heart (7-day trend) | — |
| `hrv_sdnn` (78) | ts, ms | Day state (data step) | — | Not nightly: the strap sends one every 1–2 h through the day (5 on 17 Oct). Belongs in the HRV detail |
| `resting_hr` (+ PAI estimate) | day, bpm | 7-day trend, baseline, Readiness, Energy params | Today (What changed, "Resting N" on HR card), Heart (7-day trend) | — |
| `skin_temperature` (46) | ts, °C | Baseline, Readiness (Temperature) | Today (What changed), Heart (day chart) | Shown as absolute °C; deviation from normal is what matters |
| `breath_rate` (56) | ts, /min | Baseline, Readiness (Breathing) | Today (What changed), Sleep (breathing rate chart) | — |
| `pai` (13) | ts, daily, total, restingHR, maxHR | Resting-HR fallback, max HR | Today classic only (PAI total in Activity panel) | `daily` never shown; **gone from Glow Today** |
| `daily_max_hr` (61) | day, bpm | Recovery engine (max HR) | — | Not shown |
| `strap_readiness` (0x49) | score, hrv/rhr/temp/breathing sub-scores, sleepHrv, sleepRHR | Calibration comparison | Recovery ("Strap's own readiness") | Developer-facing |
| `workout` (5) | start, end, sport, exercise s, kcal, avg/max/min HR, aerobic/anaerobic TE, load, VO2max, steps | WorkoutAnalysis | Workouts list (sport, time, duration, avg HR, kcal), Workout detail, Today (that day's workouts) | `minHeartRate`, `steps` not shown |
| `workout_hr` (6) | per-second bpm incl. 3 min after | Zones, recovery HR at 1/2 min, real end | Workout detail (HR chart, zones, recovery HR) | — |
| `recovery_hr` (70) | post-workout bpm bytes | — | — | **Stored, never read** (detail uses `workout_hr`) |
| `sport_effect` (59) | recoveryMinutes, VO2max, EPOC, weekly/monthly load, optimal min/max, maxHR | Workout detail | Workout detail (recovery time, VO2max, "weekly load N, productive range a–b") | `epoc`, `monthlyLoad` not shown; VO2max and load only per workout, no trend |
| `raw_record` (57) | type, ts, payload | — | — | Undecoded |

### 1.2 Not in Room

| Source | What | Shown where |
|---|---|---|
| `StrapController.connection` | connected, battery %, charging, firmware | Header watch dot (Today/Heart/Sleep), Device screen |
| `StrapController.sync` | running step + progress, done at, failed | Pull-to-sync, Today header, You → strap card |
| `liveHeartRate` / `liveHeartRateEnabled` | streaming bpm | Today HR card ("Live"), Heart (live toggle + value) |
| `todaySteps` (StepTotals) | strap's running total | Today steps (via `LiveSteps`) |
| `StrapInfo` | firmware, hardware, serial, DFU | Firmware screen |
| Alarms | on the strap | You → Strap → Alarms |
| Health alerts (high/low HR, high stress, low SpO2, irregular rhythm) | notification only | **Not stored, not shown in-app** |
| `SettingsStore` | paired device + auth key, Zepp account, profile (birth year, sex, weight, height, units), live HR on, glow flag | You (profile dialog, device, firmware) |
| Strap log | diagnostics lines | You → Diagnostics |

### 1.3 Derived (computed, not stored)

| Value | Computed in | Shown where |
|---|---|---|
| Baselines (prev. 7-day mean of RHR, HRV, SpO2, stress, skin temp, breathing) | `DayViewModel` | Today: What changed |
| Readiness score, 11 contributors, strain alert + signals, calibration (n/14 nights), 7-day readiness trend | `Recovery` / `RecoveryEngine` | Today (overview hero/arc), Recovery screen |
| Energy: timeline with state per minute, now, at wake, high/low, recharged, drained by exercise/stress/living | `Recovery.charge` | Today (overview), Recovery (Energy card, "Where your charge went") |
| Training load (TRIMP) today, chronic "usual day", max HR (age or fallback), stress threshold | `RecoveryEngine` | Recovery → Training load panel |
| Workout: zones, recovery HR 60/120 s, end HR, sport name | `Workouts` | Workout detail |
| Sleep contributors (duration, deep, REM, efficiency…), headlines | `Narrative` | Sleep, Glow sleep card |

### 1.4 Export coverage

- **CSV** writes 11 files: heart_rate, activity_minute, sleep_session, sleep_stage, spo2, stress, hrv, resting_hr,
  skin_temperature, breath_rate, pai. Missing: workouts, workout HR, sport effect, sleep SpO2, OSA, HRV SDNN, daily max
  HR, extended activity, strap readiness.
- **Health Connect** writes HR, steps, sleep (stages), SpO2, HRV, resting HR. Missing types HC supports: exercise
  sessions, respiratory rate, skin temperature, VO2 max.

### 1.5 What the current structure gets wrong

1. **The app's own scores have no tab.** Readiness, Energy and Training load (the parts no other app gives a Helio
   user) live on a push screen under Today.
2. **"Heart" is really "vitals".** It holds HR, resting HR, HRV, SpO2, stress and skin temperature. Stress and
   temperature aren't heart; Energy (which stress drains) isn't there.
3. **Activity has no home.** Steps, active hours and PAI exist only as a Today card. No detail, no history.
4. **Workouts is often empty.** The strap is screenless, so workouts are rare. A whole tab for a list that is usually
   empty, while training load and VO2 max sit elsewhere.
5. **Tapping a stat switches tabs.** `FocusTarget` sends a tap on Today's "Stress" to the Heart tab and a tap on
   "Breathing" to Sleep. You lose your place and the back gesture doesn't return you.
6. **Nothing looks back further than 7 days.** No week/month/year view of any metric.
7. **Five datasets are stored and invisible:** sleep SpO2, OSA events, HRV SDNN, extended activity, recovery HR. Plus
   PAI daily, daily max HR, VO2 max trend.

## 2. What the reference apps do (Mobbin)

| App | Tabs | Pattern worth taking |
|---|---|---|
| [Oura](https://mobbin.com/screens/85150daf-308e-41a4-b98c-5e6a6ee2fad0) | Today · Vitals · My Health (+ advisor) | Score row on top, one hero score with a sentence. [Vitals](https://mobbin.com/screens/22fd45f7-030e-47f7-8dab-e15ab6c5b2b3) groups metrics into sections (Heart health, Core metrics) of 2-up tiles that each open a [detail](https://mobbin.com/screens/b53b8818-c383-43c0-b9c2-754b292c41ee). |
| [WHOOP](https://mobbin.com/screens/6a012278-d01c-473e-b860-3c08e35311ed) | Home (sub-tabs Overview · Sleep · Recovery · Strain) · Plan · Community · More | Three scores, each with its own page. [Key statistics](https://mobbin.com/screens/bee12552-2907-4422-af27-33155595c4ea) as rows "vs previous 30 days". [Sleep](https://mobbin.com/screens/fac91fc6-fbf8-451e-a6bb-865d8482c380) leads with hours vs need, then 7-day charts. |
| [Bevel](https://mobbin.com/screens/746c3b08-afd9-4790-945c-ac254f31f41c) | Home · Journal · + · Fitness · Biology | Strain/Recovery/Sleep rings, then a [Health Monitor](https://mobbin.com/screens/906eb1e4-0f37-43c7-85f1-91dda02b376d) grid (RR, RHR, HRV, SpO2, Temp, Sleep) each tagged Normal/Lower. [Fitness](https://mobbin.com/screens/70391296-e949-458c-aa02-d4d0dd63df76) holds cardio load, focus, HRR; [Strain detail](https://mobbin.com/screens/4398dbfe-241b-4880-b6ef-9eafaab69861) holds zones and trend rows. |
| Garmin / Fitbit / Eight Sleep / Ultrahuman | Varies | Every metric detail is the same template: [D/W/M/Y switch, value, chart, average](https://mobbin.com/screens/f4dc3822-5cf5-4cb7-bc5a-89db05617077), [baseline band](https://mobbin.com/screens/c6dd70bc-df3e-41d0-8d4d-8e31cad79612). |

Takeaways:

- Tabs are built around **outcomes** (recovery, sleep, effort), not body parts. Nobody has a "Heart" tab.
- Raw vitals sit in a **grid of tiles with a status word** (Normal / Higher / Lower than you), and each opens a detail.
- **One detail-screen template** reused for every metric, with a range switch.
- Workouts are a **section inside the effort tab**, not a tab.

## 3. Proposed tabs

```
Today · Recovery · Sleep · Activity · You
```

| Now | Proposed | Why |
|---|---|---|
| Today | **Today** | Keep. Glow Today is the base. |
| Heart | **Recovery** | The scores (Readiness, Energy) and the body signals that feed them. HR becomes a metric, not a tab. |
| Sleep | **Sleep** | Keep. It's the richest dataset and the morning's first question. Gains the hidden sleep data. |
| Workouts | **Activity** | Steps, PAI, load, VO2 max and workouts together. Never empty, because steps always exist. |
| You | **You** | Keep. |

**Are we keeping Heart, Sleep, Workout?** Sleep yes. Heart no: it splits into Recovery (vitals) and a Heart-rate
detail. Workouts no as a tab: it becomes the Workouts section of Activity, with the workout detail unchanged.

One rule for all tabs: **a tap opens a detail inside the current tab** (push), never a tab switch. `FocusTarget`
goes away; each target becomes a route to the metric detail.

Every tab keeps the date header (day picker, sync, strap dot) except You.

### 3.1 Today: "How am I, what changed, what next"

Mostly as Glow Today is now. Each thing appears once; everything links deeper.

1. Date header.
2. **Overview** (glow, hero): lead score (Recovery in the morning, Energy later), the other score and Sleep as facts,
   nested half arcs. Strain alert. → Recovery tab.
3. **Last night** (glow, morning only): asleep, window, score + headline, hypnogram, naps line. → Sleep tab.
4. **What changed** (quiet): Readiness sentence, then 2-up tiles: RHR, HRV, SpO2, skin temp, stress, breathing vs
   7-day. → metric detail (in Today's stack).
5. **Heart rate** (glow): now/latest, resting, day curve. **Live toggle moves here** from Heart. → HR detail.
6. **Activity** (glow): steps vs goal, hourly bars. Add PAI and active hours as facts (both dropped in glow). →
   Activity tab.
7. **Today's workouts** (quiet rows). → workout detail.
8. **Last night** (afternoon position).
9. New: **Strap alerts** row when one fired today (needs storing alerts, see §4).

### 3.2 Recovery: "Can I push today, and why"

1. Date header.
2. **Recovery** hero: score / 100, headline, Readiness sentence, calibration progress (n/14 nights).
3. **Signs of strain** (only when `strainAlert`): the alert signals.
4. **Energy**: now, at wake, high/low; the day timeline coloured by state (sleep, rest, stress, activity, exercise);
   recharged vs drained (exercise / stress / living). → Energy detail (= today's "Where your charge went").
5. **Contributors**: the 11 factors with score and detail line. Grouped: *Body* (HRV balance, RHR, temperature,
   breathing, blood oxygen), *Sleep* (last night, balance, recovery index, breathing disturbances), *Load*
   (previous day, balance).
6. **Body signals** grid, Bevel-style (2-up tiles, value + Normal/Higher/Lower vs your range + 7-day sparkline):
   Resting HR · HRV · Skin temp (as **deviation** from normal, not °C) · Breathing · Blood oxygen (night) · Stress
   (day avg). Each → metric detail.
7. **Recovery, last 7 days** trend (→ detail with W/M/Y).
8. **How it works** (collapsed). **Strap's own readiness** moves inside it (it's a calibration aid).

### 3.3 Sleep: "How did I sleep and is it trending right"

1. Date header (the night ending on the day).
2. **Hero**: score + headline, or time asleep vs goal when there's no score. Asleep / in bed, bedtime – wake.
3. **Stages**: hypnogram, stage bars with minutes and %, woke N×.
4. **Contributors** (duration, deep, REM, efficiency, …).
5. **Sleep vitals** grid: lowest HR + when (`nadirTime`), avg HR, HRV during sleep (from `hrv`; `hrv_sdnn` is daytime), breathing
   rate, **sleep SpO2 (`sleep_spo2`, new)**, skin-temp deviation. Each → metric detail scoped to the night.
6. **Breathing disturbances (new)**: events/hour (from `osa_result.eventCount`), with the event list from `osa_event`
   in its detail (drop size, the SpO2/HR trace around each). Label as "not a diagnosis"; units unverified, keep it
   off until confirmed on a real strap.
7. **Naps**: list, each opens stages + HR.
8. **This week**: duration bars vs goal, score line, bedtime/wake consistency (all derivable from `sleep_session`).
   → Sleep history detail.

### 3.4 Activity: "How much did I move and train"

1. Date header.
2. **Steps** hero: steps vs goal, hourly bars, active hours of 10, distance and calories (from `activity_extended`,
   once units are confirmed). → Steps detail (D/W/M/Y).
3. **PAI**: today's PAI (`pai.daily`, new) and 7-day total (target 100). → PAI detail.
4. **Training load**: today's TRIMP vs usual day; this week's load vs productive range (`sport_effect`
   weekly/optimal). Moved here from Recovery. → Load detail (with `monthlyLoad`).
5. **Fitness**: VO2 max latest + trend across workouts (new), recovery time left from the last workout, max HR
   (`daily_max_hr` / profile).
6. **Workouts**: this day's, then recent, grouped by date. → Workout detail (unchanged: summary, HR per second,
   recovery HR, zones, training effect, load, VO2 max; add min HR and steps).
7. Empty states that point to what will appear (as now for workouts).

### 3.5 You

1. **Profile**: birth year, sex, weight, height, units.
2. **Goals (new)**: steps, sleep, active hours. Today these are constants (`STEP_GOAL`, `SLEEP_GOAL_SECONDS`,
   `ACTIVE_HOURS_GOAL`).
3. **Strap** → pairing, battery, firmware, sync, alarms, firmware update, Zepp account.
4. **Your data**: CSV export, Health Connect (and widen both, §1.4).
5. **Support**: diagnostics. Debug: glow toggle, design lab, sample data.

### 3.6 One metric-detail template

Every "→ detail" above is the same screen, which is where glow's detail-screen language gets defined:

- Header: metric name, back. Range switch **D · W · M · Y** (D = intraday curve; W/M/Y = one point per day).
- Big value for the selected range (latest / average) with status vs your normal.
- Chart with your normal as a band (baseline mean ± sd from `Recovery.Baseline`).
- Facts row: low / avg / high, or min-max for the range.
- "What it means" and "What moves it" (short, collapsed).
- Related metrics (e.g. HRV → RHR, sleep).

Metrics: Heart rate, Resting HR, HRV, Blood oxygen (day / night), Stress, Skin temp, Breathing, Steps, PAI, Sleep
duration / score, Recovery, Energy, Training load, VO2 max.

This needs repository queries over arbitrary ranges with per-day aggregates; today everything is per-day or 7 days.

## 4. Data work this implies

| Change | Needed for |
|---|---|
| Read `hrv_sdnn`, `sleep_spo2`, `osa_result`/`osa_event` into the Sleep state | Sleep vitals, breathing disturbances |
| Read `pai.daily`, `daily_max_hr`, sport-effect trend | Activity |
| Confirm `activity_extended` units on hardware | Distance confirmed; calories likely; floors unseen |
| Store health alerts in a table | Today alert row, history |
| Per-day aggregate queries for W/M/Y | Metric-detail template |
| Goals in `SettingsStore` | Steps / sleep / active-hour goals |
| Widen CSV and Health Connect export | Completeness |
| Replace `FocusTarget` tab jumps with in-tab detail routes | Navigation |

## 5. Open decisions

1. **Name of the score.** Classic UI says "Readiness"; Glow overview says "Recovery". Pick one word for the score and
   use the tab name to match. Proposal: the tab and the score are both "Recovery"; "Readiness" disappears from UI.
2. **Today's HR chart.** Keep the full-day curve on Today (current glow) or reduce it to now/resting and leave the curve
   to the HR detail. Keeping it is fine; it's the only daytime chart on Today.
3. **Breathing disturbances.** Show only after real-strap verification of `osa_result` units.

## 6. Zepp: what to take, what we already do better

Mobbin has no Zepp screens, so this comes from the 10.9.0 decompile (`work/jadx`) and the teardown in
`analysis/codemap/06-health-features-and-algorithms.md`. Strings are quoted by resource name.

### 6.1 How Zepp is organised

Tabs (`MainTabActivity.java:432-437`): **Home · Workout · Discover (or Badges) · Aura (when on) · Device · Profile**.

- Every health number lives on **Home** as a long, user-editable card list: a "triple rings" header, "Core Metrics"
  (`homepage_key_statistics`, "Edit Core Metrics"), a "Heart health" block you can hide or show
  (`homepage_health_monitor_*`), then cards for HybridCharge, Readiness, Sleep, Heart rate, RHR, SpO2, Stress, PAI,
  VO2 max, workouts this week, and more. Each card opens its own detail page.
- Two of the tabs are content and upsell (Discover feed, Aura subscription), and one is device management.
- So Zepp has no structure by outcome. Home is one long list, and Recovery-type questions ("can I push today?") need
  three cards (Energy, Readiness, Exertion).

### 6.2 Worth taking

| From Zepp | Where it goes in OpenStrap | Data we have |
|---|---|---|
| **Sleep regularity**: score from ≥ 5 nights, "Avg. fall-asleep / Avg. wake-up, last 7 days", bands 0–59 / 60–79 / 80–89 / 90–100 (`sleep_ui_sleep_regularity*`, `libsleep_regularity.so`) | Sleep → This week | `sleep_session` |
| **Sleep breathing quality** in events/hour with plain bands: < 5 normal, 5–15 "suspected low risk", 15–30 medium, > 30 high (`sleep_ui_breath_*`) | Sleep → Breathing disturbances | `osa_result`, `osa_event` |
| **HRV across the night** ("Sleep Timeline", `hrv_whole_chart_title`) with baseline, min/max, Higher/Lower | Sleep vitals → HRV detail | `hrv`, `hrv_sdnn` |
| **Higher / Lower / Faster / Slower** status words against baseline on each vital (`readiness_hrv_high`, `readiness_rhr_fast`, "VS. LAST %d DAYS") | Recovery → Body signals grid | Baselines |
| **Weekly / monthly / yearly summaries** and a weekly report for Readiness (`readiness_week_summary`, `readiness_weekly_report`) | Metric detail W/M/Y, plus a weekly recap card on Today on Mondays | Everything |
| **PAI coaching**: "You can still earn %d PAI today", "Keep the heart rate above %d BPM for N min" (`pai_distance_data_day`, `pai_hint_get_by_sport_*`) | Activity → PAI | `pai`, profile max HR |
| **Exertion target**: a daily load target that drops when Energy or Readiness is low (`tab_exertion_detail_introduction_content2_v2`), plus fatigue and fitness levels | Activity → Training load: today vs a target, not just vs "usual day". Fatigue/fitness = acute/chronic load we already compute | TRIMP, chronic load |
| **Stress bands** with words: Relaxed 0–39, Normal 40–59, Medium 60–79, High 80–100 | Stress tile and detail | `stress` |
| **Score bands** for colour and wording: Energy 0–59 / 60–79 / 80–100, Readiness 0–69 / 70–84 / 85–100, sleep 60 / 80 / 90 | Glow colour of each hero (today's overview uses 50 / 70) | — |
| **Monitoring check**: "To calculate Readiness you need to enable all health monitoring" with an "Enable all" button (`readiness_health_detect_*`) | Recovery empty state + Strap screen: read the strap's monitoring settings and offer to turn on what's off | Strap settings module |
| **Customisable Core Metrics** (choose which stats show) | Today → What changed: let the user pin which tiles show (WHOOP does this too) | — |
| **Irregular rhythm history**: Zepp has an "Abnormal heartbeat" card | Today alert row + a history list under the HR detail | Health alerts (store them first) |

### 6.3 Not worth taking

- **Discover feed, Badges, Aura subscription, "Compared with other users"** (`sleep_ui_sleep_compare_title`). Content,
  social and upsell, with no strap data behind them.
- **The single long Home list.** It's the thing the tab proposal fixes.
- **Multi-device fusion** (readiness "fusionData"). We support one strap.
- **Generic coach programmes** (Sleep Coach challenges, Zepp Coach plans). They need cloud content; out of scope.

### 6.4 Where OpenStrap is already better

| | Zepp | OpenStrap |
|---|---|---|
| Privacy | All health data uploaded, no local-only mode; ~520 analytics events; Firebase forced on outside China; contact list upload (`analysis/privacy/tracking-and-network.md` §Executive summary) | Everything stays on the phone. No analytics, no trackers. Network only for sign-in and firmware, on request |
| Readiness | For a strap, it's the strap's own score with three detail cards (HRV, RHR, temperature) | Our own score with 11 weighted contributors, each with a detail line, a strain alert, calibration progress, and the strap's score shown beside it for comparison |
| Energy | HybridCharge runs in a closed native library (`libAlgoCharge.so`); the UI shows "Charged" and "Drained" totals | Open model. Timeline with a state per minute; drains split into exercise, stress and living |
| What changed | Each metric only on its own card | One place comparing every vital with your 7-day normal |
| Your data | Behind a Zepp account | CSV zip and Health Connect straight from the phone, no account |
| Kept data | — | Raw OSA traces, nightly SDNN, undecoded records kept for later parsing |
| Algorithms | Closed native libraries | Open and documented (`docs/algorithms/`) |
| Focus | Six tabs, two of them content/upsell | Five tabs, all about your data and your strap |

### 6.5 Changes to the tab proposal from this

- **Sleep** gets *Regularity* in "This week" (since replaced by the Sleep Regularity Index with UK Biobank quintile bands; see algorithms/calculations.md) and the breathing-disturbance bands above.
- **Recovery** signal tiles use Higher/Lower/Faster/Slower words, not just arrows.
- **Activity** turns Training load into *today vs target*, where the target drops on a low-Energy or low-Recovery day,
  and PAI gets "earn N more today".
- **Today** gets a weekly recap card (Mondays) and user-chosen What-changed tiles.
- **Strap screen** gets a monitoring check, since Readiness and Energy both depend on it.
