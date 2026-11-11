# Apex design system

This is the UI and UX source of truth for Apex. It is a Jetpack Compose translation of the look and
interaction model of **Pulse Mobile 0.5.0** (an Expo / React Native app for the same use case: Fitbit data,
recovery / strain / sleep, local-first). The owner chose Pulse as the design reference.

- **Reference location (outside this repo, not committed):** `design-reference/pulse-mobile-0.5.0/`
  - Full spec, 3,000 lines: `docs/design/spec.md` (cited below as *Pulse §x.y*)
  - Screen rules: `docs/screen-rules.md`
  - Tokens: `global.css` and `src/ui/palette.ts` (light + dark, identical values)
  - Kit: `src/ui/` (shells, metrics, charts), screens: `src/screens/`, routes: `app/`
  - Screenshots: `docs/screenshots/` (`framed/` has the phone frames), widget renders in `docs/images/widgets/`
  - Installable build for hands-on comparison: `design-reference/pulse-mobile-0.5.0-arm64.apk`
- **License note.** Pulse is PolyForm Noncommercial 1.0.0. Apex is a personal, noncommercial app, so studying
  it is fine. We translate the *design* (token values, layout, type roles, interaction rules) into our own
  Kotlin; we do **not** copy its TypeScript, its "PULSE" wordmark, its logo/icons, or its copy verbatim.
  Original icon and artwork only (master prompt §7.3).

Where this document and the reference disagree, this document wins. Where this document is silent, follow
the reference spec section it points to, then the master prompt.

---

## 1. Direction

A premium instrument panel for one user, checked in bed in the morning and at night, often in a dark room.

- **Dark-first.** A dark slate ground that stays fixed while content scrolls; opaque charcoal cards with a
  faint top light; white tabular numerals; uppercase tracked labels; colour only for data meaning.
  A light theme exists (Pulse ships both) and is selectable in Settings; dynamic colour is off.
- **The number is the hero.** One dominant element per screen: the dial sweep on Overview and the score
  details. Nothing else moves without a cause.
- **Colour is a data channel.** Recovery green / yellow / red, strain blue, sleep steel blue, optimal teal,
  warning orange. Chrome is white and grey. The single exception is the floating action's indigo-to-blue rim.
- **Depth by layer.** Ground (fixed) → cards (opaque, top light) → chrome (glass: tab bar, floating
  action only) → overlays (dimmed). Never put content on glass.
- **Honest states.** Every metric renders one of: loading, value, provisional, calibrating, stale,
  unavailable (with a reason), error. Never a fabricated number, never zero for missing (Pulse §4.9, §5.14).
- **Three layers per metric** (master prompt §12): *what* (value, unit, provenance, freshness),
  *meaning* (vs. personal range, plain words), *action* (what to do today).

## 2. Tokens

All values live in code: `core/ui/src/main/kotlin/com/apex/athlete/core/ui/theme/`.

| File | Contents | Reference |
|---|---|---|
| `Color.kt` | `ApexColors` (light + dark), recovery band helpers | Pulse `global.css`, `palette.ts`, §2.1-2.3 |
| `Type.kt` | Figtree + Barlow families, `ApexTypography` roles | Pulse §3 |
| `Dimens.kt` | `ApexRadius`, `ApexShapes`, `ApexSpacing`, `ApexDial`, `ApexMotion` | Pulse §2.4, 2.5, 2.7, 5.1 |
| `Theme.kt` | `ApexTheme { }`, `ApexTheme.colors`, `ApexTheme.type`, M3 scheme mapping | - |

Rules:
- Components use tokens only. No raw hex outside `Color.kt`.
- Text in a data colour uses the `*Text` variant where one exists (`recoveryRedText`, `strainText`,
  `optimalText`, `warningText`, `coachText`). `ColorContrastTest` enforces 4.5:1 for text tokens on
  `card` and `backgroundTop` in both themes; add any new text token to that test.

### 2.1 Ground
Vertical gradient `backgroundTop` (0) → `backgroundMid` (270 dp) → `background` (740 dp+), drawn once
behind the scaffold, fixed (does not scroll).

### 2.2 Data colour meanings (only these meanings)

| Token | Meaning |
|---|---|
| `recoveryGreen / Yellow / Red` | Recovery ≥ 67 / 34-66 / ≤ 33 (`recoveryBandOf`) |
| `strain`, `strainText`, `strainDeep` | Strain fill, HR line; workout spans in charts |
| `dialTarget` | Strain target range arc on the dial track |
| `sleep`, `sleepDeep` | Sleep performance; sleep spans in charts |
| `stageAwake / Rem / Light / Deep` | Hypnogram lanes |
| `optimal` | In range, helps, positive delta, improving |
| `warning` | Out of range, hurts, poor, negative delta |
| `recoveryRed` (as alert) | Illness-like signal from `FatigueSignals` |
| `coach`, `insightFrom → insightTo` | Insight card link and its 1 dp gradient hairline |
| `chart1..5`, `chartGrid`, `chartBand`, `chartCursor` | Chart series and furniture |

Training-load band (ACWR): 0.8 to < 1.3 `optimal`, 1.3 to < 1.5 `warning`, ≥ 1.5 `recoveryRed`,
< 0.8 `mutedForeground` (Pulse §2.3, matches the master prompt's shaded 0.8-1.3 band).

### 2.3 Radii (do not mix)
Bars/tracks/dashes 2 (never pill ends) · swatches 4 · chips 8 · rows inside cards 10 · buttons in cards 12 ·
cards 16 · info card 24 · sheets 28 (top corners) · glass chrome 22 · pills full. Concentric rule: a row
inset 6 dp inside a 16 dp card is 10 dp.

### 2.4 Layout (phone)
Gutter 16 · card padding 16 · gap between cards 12 · section gap 32 · list row 56 · **min touch 48**
(Apex brief; Pulse uses 44) · floating tab bar 62 tall, inset 12 · round action 62 · detail header 52 +
status bar. Content bottom padding clears the tab bar + 24 dp.

### 2.5 Materials
| Material | Used by | Compose recipe |
|---|---|---|
| Ground | page | gradient §2.1, fixed |
| Card (opaque) | every card | `ApexShapes.card`, vertical gradient `cardTop → card`, 1 dp top hairline `cardEdge`; no shadow, no border, never nested |
| Row | rows inside a card | `ApexShapes.row`, `secondary` fill |
| Glass | tab bar, floating action only | vertical gradient `glassTop → glassBottom`, 1 dp rim `glassRim`, top edge `glassEdge`; active tab lens `glassLens`. Use `Modifier.blur` only on API 31+, otherwise the tokens are near-opaque and still pass contrast |
| Overlay | info card, sheets, menus | info card `ApexShapes.infoCard` gradient `popoverTop → popover`; dim `dimStrong` behind (no blur) |

### 2.6 Motion
Durations and easings in `ApexMotion`. Press scale 0.96 (150 ms, `standard`). Dial sweep 700 ms from 0
on first show and from the previous value on day change. Chart draw 500 ms. No staggered entrances, no
count-up numbers, no animation on load besides the dial sweep. When the system animator scale is 0
(Remove animations), every animation snaps to its end state.

### 2.7 Icons
Original outline icons at 1.75 stroke, 16/20/24 dp, `currentColor`. Material Symbols Outlined is an
acceptable base for generic glyphs (back, info, chevrons, settings). The Apex mark (wordmark, app icon,
floating action glyph) is original artwork: do not reuse Pulse's mark or any WHOOP/Oura/Fitbit/Google asset.

## 3. Typography
Faces: **Figtree** (text) and **Barlow** (numerals, tabular figures via `"tnum"`), bundled in
`core/ui/src/main/res/font/`, SIL OFL 1.1 (licenses in `core/ui/fonts-licenses/`; list them in the
in-app licences screen). Roles are in `ApexTypography` with their Pulse §3.2 / §3.4 sizes.

Numeral rules (Pulse §3.3): tabular figures for every changing number; unit after the value in the unit
role (`72` `%`, `124` `ms`); real minus sign U+2212; `+` on positive deltas; missing data shows `--` in
the value role in `mutedForeground`; metric/imperial and 12/24 h follow Settings. Text sizes are `sp` and
layouts must wrap rather than clip at 200 % font scale.

## 4. Shells and navigation

**Apex adopts Pulse's information architecture** (decision recorded in the master prompt v4.1, §3):

```
Floating glass tab bar:  Overview · Health · Journal · More        + round floating action (Coach)
```

| Apex destination | Pulse reference (route → screen) | Contents (engine source) |
|---|---|---|
| **Overview** (tab) | `/` → `src/screens/home` ; screenshot `01-home.png` | Header: profile, date pill (◀ TODAY ▶), sync status (time since last sync, stale dot). "APEX" wordmark. Three dials: Sleep · **Recovery** (centre, larger) · Strain with target arc (`SleepScoreEngine`, `RecoveryEngine`, `StrainEngine`/`StrainTarget`). Heart-rate card (latest + last 30 min line, intraday HR). Health Monitor card (HRV, RHR, SpO2, breathing, skin temp vs baseline: `Baseline`/`MetricIntelligence`). Strain-target prescription card. Morning coach card (`RuleBasedCoachEngine`). Out-of-range alert card. Collapsing header keeps three mini rings once the dials scroll away |
| Recovery (detail, from dial) | `/recovery` ; `03-recovery.png` | Hero dial + band word. KeyStatRows: HRV, RHR, respiratory rate, sleep performance, each today vs 30-day with delta arrow. Insight card. `FatigueSignals` flags, calibration progress, "what moved the score" drivers, how-it's-calculated info card |
| Strain (detail) | `/strain` ; `04-strain.png` | Hero dial 0-21.0 with target arc + tick. Time in HR zones (ZoneBars on hatched track). Activities list → workout detail. Training load (ACWR/CTL/ATL/TSB chart with 0.8-1.3 band), monotony. Manual workout + RPE (`USER_REPORTED`) |
| Sleep (detail) | `/sleep` ; `02-sleep.png` | Hero dial with Poor/Sufficient/Optimal dashes. Contributor rows: hours vs needed, consistency (`CircularTime`), efficiency. Hypnogram (stage rows on hatched track). Restorative %, latency, wake bouts. Tonight's `SleepNeed` + bedtime suggestion |
| **Health** (tab) | `/health`, `/health/monitor`, `/health/fitness`, `/health/heart-rate`, `/trend/[key]` ; `06-stress-monitor.png`, `07-trends.png` | Health Monitor detail; Trends (BiometricSparklineCard per metric: value, 28-day band, Z badge, 14-day sparkline; trend detail with ranges); Fitness (`CardioFitness` VO2 max); Heart rate day view |
| **Journal** (tab) | `/journal`, `/journal/insights`, `/journal/impact` | Daily check-in (behaviours as `USER_REPORTED`), later: impact of behaviours on recovery. Lowest priority (M5) |
| **More** (tab) | `/more`, `/settings`, `/more/data`, `/more/how-it-works`, `/connect` | **Data Sources & Diagnostics** (Google/Fitbit connect, Health Connect permissions, sync watermarks, rate-limit budget, **Takeout import card**, layout report), Settings (theme, units, clock, notifications + quiet hours, AI coach key, Demo toggle), Export / import / Delete all my data, How Apex works (FORMULAS.md per score), algorithm version, licences |
| Coach (floating action) | `/coach` ; `08-coach.png` | Rule-based briefing first; optional "Ask Apex" (own key, off by default, "what gets sent" preview, `AI_INTERPRETED` label) |
| Onboarding | `/onboarding`, `docs/onboarding.md` | Master prompt §12 sequence; Demo mode reachable from the first screen |

Shell components to build in `:core:ui` (Pulse §4): `ApexScaffold` (fixed ground + glass tab bar +
floating action), `HomeHeader` (collapsing, mini-ring row), `DetailHeader` (back · date title · info),
`DetailShell` (hero, insight, primary, secondary sections), `SectionShell`, `InfoCard` (centred dialog),
`ApexSheet` (bottom sheet), `MetricState` (the state switch every metric renders through).

Navigation behaviour: tab roots keep their own back stacks; detail screens push over the tabs with the
standard transition and predictive back; the day is a nav argument (`d=yyyy-MM-dd`), and the date pill
steps days without leaving the screen.

## 5. Components (`:core:ui`)

Each component takes plain UI-state models (never DAOs or engines), renders through `MetricState` when its
value is nullable, has a skeleton in its final shape, a `@Preview` in light and dark, a TalkBack
`contentDescription` that carries the same information as the visual, and no per-frame allocations in
`DrawScope`. Charts are drawn with Compose `Canvas` (no chart library needed).

| Component | Pulse ref | Master-prompt name | Notes |
|---|---|---|---|
| `ScoreDial` (sizes mini 22 / sm 56 / home 96 / hero 240; variants recovery, strain, sleep, stat) | §5.1 | `ArcGauge` | Clockwise from 12 o'clock after a 4° gap each side; flat caps; track `dialTrack`. Strain: ring full at 21.0, target range arc `dialTarget` + foreground tick under the fill. Hero: wordmark inside, value 64 sp with 0.55x unit, label, band word in `foregroundSecondary`. Reason state: full track, no fill, `--` |
| `StrainTargetBar` | §7.3 | `StrainTargetBar` | Current strain vs `StrainTarget` optimal range |
| `KeyStatRow` | §5.2 | - | Icon, caps label, value + unit, 30-day average below, delta arrow (filled 8 dp triangle; neutral = 6 dp dot), chevron. Direction/tone per Pulse §5.0 "Delta arrows" |
| `ContributorRow` + status dashes | §5.3 | - | Poor / Sufficient / Optimal three-segment dash, 2 dp corners |
| `DriverList` | §5.4 | - | "What moved the score" |
| `TrendChart` | §5.5 | `BiometricSparklineCard` | Value, 28-day baseline band, Z badge, 14-day sparkline. Gaps are gaps (`null` breaks the line) |
| `Hypnogram` | §5.6 | `SleepHypnogramChart` | Awake / REM / Light / Deep lanes, stage colours |
| `IntradayHrChart` | §5.7 | - | Overview heart-rate card and HR day view |
| `ZoneBars` | §5.8 | - | 5-zone time-in-zone on the hatched track (`patternHatch`) |
| `AcwrTrendChart` | - | `AcwrTrendChart` | Acute, chronic, ACWR with shaded 0.8-1.3 band |
| `DayStrip`, `ActivityCard`, `InsightCard`, `ConnectionBanner`, `ReasonPlaceholder`, `ProvenanceLabel`, `StatusChip`, `Tag`, `Skeleton` | §5.11-5.19 | - | `ProvenanceLabel` is Apex-specific: every displayed value shows its `DataProvenance` and freshness |

Charts (Pulse §5.0): fixed heights per component; grid horizontal only; ticks in the chart role,
`mutedForeground`; scrubbing shows a tooltip that snaps to the nearest point; never interpolate a gap.

## 6. Copy
Direct, calm, plain. Sentence case in source; caps via style. No em dashes in UI copy; ranges use a spaced
hyphen ("12.0 - 15.0"). No guilt streaks, no emoji, never diagnostic. Metric names, one per metric
everywhere: Recovery, Strain (Day Strain on the hero), Strain Target, Sleep Performance, Sleep Need,
Sleep Debt, Training Load, Heart Rate Variability, Resting Heart Rate, Respiratory Rate, Blood Oxygen,
Skin Temperature, VO2 Max. Scores are Apex's own calculations, never presented as another company's score.
All copy in `strings.xml` (no literals in composables).

## 7. Accessibility
AA contrast (enforced for tokens by test), 48 dp targets, TalkBack equivalence for every dial and chart
("Recovery 72 percent, green"; "Strain 9.4 so far, target 10.0 to 14.0"; "Recovery unavailable: calibrating,
4 nights left"), 200 % font without clipping, reduced motion honoured, colour never alone (band word,
arrow direction, icon + text on chips).

## 8. Deliberate deviations from the Pulse reference

| Pulse | Apex | Why |
|---|---|---|
| Name "Pulse", "PULSE" wordmark, P/bars mark | "Apex", original APEX wordmark and mark | Own product; no copied artwork |
| Strain as a percent (0-100+) | **Strain 0-21.0** (dial full at 21) | `:core:analytics` `StrainEngine` is 0-21; formulas are audited-then-trusted (master prompt §2) |
| Health Connect only | Google Health API / Fitbit Web API + Health Connect + Takeout ZIP | Master prompt tri-source scope |
| Writes workouts to Health Connect | **Read-only** everywhere | Master prompt invariant 10 |
| Sentry error telemetry | **No telemetry / crash SDKs** | Master prompt invariant 8 |
| Pulse Age orb, Healthspan, Stress Monitor, Energy Bank, nutrition, ECG, breathe, live workout, BLE | **Not built** unless an Apex engine with documented formulas exists | No fabricated metrics; not in the brief |
| No demo mode | **Demo mode** with a separate store and persistent banner | Master prompt §3 |
| 44 pt minimum hit area | 48 dp | Master prompt §12 |
| Light theme as an alternate | Dark default; light selectable; dynamic colour off | Master prompt §7.3 |
| Expo / NativeWind / Skia | Jetpack Compose + Canvas | Native Kotlin app |
| Light `strain-text` `#0077bf` (4.49:1 on the light ground) | `#0075bb` (4.6:1) | Caught by `ColorContrastTest`; AA requires 4.5 |
| Master prompt §7.3 colours (`#0A0D12`, `#00E676`, ...) | **Replaced by the Pulse-derived tokens in `Color.kt`** | Owner's design choice; recorded in prompt v4.1 |

## 9. Design review loop
Per master prompt §12, render every hero screen in light and dark at 100 % and 200 % font, put the
image next to the matching Pulse screenshot in `design-reference/pulse-mobile-0.5.0/docs/screenshots/`,
critique (five-second test, one dominant element, honest visuals, contrast, targets) and revise, twice.
Record each pass in `docs/PROGRESS.md`.
