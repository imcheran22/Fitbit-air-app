# Evidence register for formulas and constants

One entry per formula and constant in `:core:analytics` (algorithm version 2). Companion to
`docs/FORMULAS.md` (what the code does) and `docs/AUDIT.md` ("Formula review": what changed and why).

## How to read this

**Verification status.** During the version 2 review no source could be opened: the session's network
allow-list blocked PubMed and Europe PMC (DNS failure). Therefore **every citation below is from the
reviewer's recollection and is "unverified"**: author, year and journal are given so that the owner can
look each one up, but sample sizes, errors and population details must be checked against the paper
before they are quoted anywhere user-facing. No URLs are given because none were fetched. Items that
are Apex's own design carry no citation on purpose.

**Evidence grade.**

| Grade | Meaning |
|---|---|
| validated | the formula or constant comes from a named study that tested it against an outcome or reference measure in a stated population; its error is known (at least roughly) |
| reasonable heuristic | the idea is published and widely used, but this exact form, scale or threshold was not validated for this use (other population, other load measure, or contested) |
| Apex-specific choice | a calibration or design decision made for this app; there is no source and no validation, only the stated reason |

Nothing in this app is a diagnosis. Scores summarise recorded data against the user's own history.

## Sources (all unverified, see above)

| Key | Citation as recalled | What it is used for | Population and known error, as recalled |
|---|---|---|---|
| Tanaka 2001 | Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited. J Am Coll Cardiol 2001;37(1):153-156 | HRmax = 208 - 0.7 age | Meta-analysis of healthy adults plus a laboratory sample; independent of sex and activity level; an individual's true HRmax is commonly quoted as about 10 bpm either side of the prediction. Sample sizes (351 studies / 18,712 subjects / 514 lab) are recalled and unverified. |
| Banister 1991 | Banister EW. Modeling elite athletic performance. In: Green HJ, McDougal JD, Wenger H (eds), Physiological Testing of Elite Athletes. Human Kinetics, 1991, pp 403-424 | TRIMP definition, sex-specific a and b | Small samples of trained athletes; designed for training sessions, not 24 h wrist data. |
| Morton 1990 | Morton RH, Fitz-Clarke JR, Banister EW. Modeling human performance in running. J Appl Physiol 1990;69(3):1171-1177 | Impulse-response (fitness-fatigue) model that TRIMP feeds | Few runners; the model fits individuals, parameters vary widely between people. |
| Foster 1998 | Foster C. Monitoring training in athletes with reference to overtraining syndrome. Med Sci Sports Exerc 1998;30(7):1164-1168 | Monotony and strain (weekly load x monotony) | Observational, session-RPE based load in athletes; association with illness, not a validated predictor. |
| Foster 2001 | Foster C et al. A new approach to monitoring exercise training. J Strength Cond Res 2001;15(1):109-115 | Session-RPE (RPE x minutes); open point on manual workouts | Validated against heart-rate based load in several sports (correlations moderate to high, individual error remains). |
| Williams 2017 | Williams S, West S, Cross MJ, Stokes KA. Better way to determine the acute:chronic workload ratio? Br J Sports Med 2017;51(3):209-210 | Exponentially weighted ACWR, alpha = 2/(N+1) | Rugby-type team sport data; argues the EWMA form is more sensitive than rolling averages. Initialisation not specified. |
| Impellizzeri 2020 | Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ. Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. Int J Sports Physiol Perform 2020;15(6):907-913 | Caveat on any ratio band | Methodological critique: spurious correlation, coupling, no causal injury evidence. |
| Gabbett 2016 | Gabbett TJ. The training-injury prevention paradox: should athletes be training smarter and harder? Br J Sports Med 2016;50(5):273-280 | Origin of the 0.8-1.3 "sweet spot" and 1.5 "danger" bands | Team-sport athletes, session-RPE and GPS loads; association with injury, contested (see Impellizzeri 2020). |
| Plews 2013 | Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M. Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring. Sports Med 2013;43(9):773-781 | ln RMSSD as the HRV measure, weekly average of ln RMSSD | Review of endurance athletes; supports trend use against own baseline, not absolute cut-offs. |
| Plews 2014 | Plews DJ, Laursen PB, Le Meur Y, Hausswirth C, Kilding AE, Buchheit M. Monitoring training with heart-rate variability: how much compliance is needed for valid assessment? Int J Sports Physiol Perform 2014;9(5):783-790 | Why a weekly HRV mean needs several readings | Triathletes; recalled conclusion is that a small number of readings per week (about three) is enough for the weekly ln RMSSD mean. Unverified. |
| Buchheit 2014 | Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol 2014;5:73 | Resting HR and HRV against a personal baseline | Narrative review; individual thresholds, not population cut-offs. |
| Uth 2004 | Uth N, Sorensen H, Overgaard K, Pedersen PK. Estimation of VO2max from the ratio between HRmax and HRrest - the Heart Rate Ratio Method. Eur J Appl Physiol 2004;91(1):111-115 | VO2max = 15.3 x HRmax / HRrest | Derived in trained men; error of several ml/kg/min outside that group (recalled). |
| Hirshkowitz 2015 | Hirshkowitz M et al. National Sleep Foundation's sleep time duration recommendations: methodology and results summary. Sleep Health 2015;1(1):40-43 | 7-9 h adult range | Expert-panel review of the literature. |
| Watson 2015 | Watson NF et al. Recommended amount of sleep for a healthy adult: a joint consensus statement of the AASM and SRS. Sleep 2015;38(6):843-844 | "At least 7 h" for adults | Expert-panel consensus. |
| Ohayon 2017 | Ohayon M et al. National Sleep Foundation's sleep quality recommendations: first report. Sleep Health 2017;3(1):6-19 | Only cited in `FORMULAS.md` section 4 as the possible origin of an 85 % sleep-efficiency mark | Expert-panel consensus; recalled, unverified. Not used by any formula. |
| Karvonen 1957 | Karvonen MJ, Kentala E, Mustala O. The effects of training on heart rate: a longitudinal study. Ann Med Exp Biol Fenn 1957;35(3):307-315 | Heart-rate-reserve zones | Young men; zone fractions in common use are conventions. |
| Edwards 1993 | Edwards S. The Heart Rate Monitor Book. 1993 (book) | 50/60/70/80/90 % of HRmax zones | Popular-press convention, no validation study. |

## Register

### 1. Baselines and trends (`baseline/`, `trend/`, `stats/`)

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| Compare against the user's own history, never population norms | - | Plews 2013; Buchheit 2014 | validated (athlete cohorts) |
| HRV on the natural-log scale | ln(RMSSD) | Plews 2013 | validated |
| Baseline window, evaluation day excluded | 30 days | Common in wearable practice; not tied to a study. Excluding day D avoids self-comparison. | Apex-specific choice |
| Minimum valid days before a baseline exists | 7 | Apex choice; below it everything stays locked (no population fallback) | Apex-specific choice |
| Standard deviation | sample SD, n-1 | Statistical convention | reasonable heuristic |
| Personal normal range | mean +/- 1 SD (ln scale for HRV) | Plews/Buchheit use a smallest-worthwhile-change band (about 0.5 SD or a CV-based band); +/-1 SD is wider and is Apex's choice | Apex-specific choice |
| z-score clamp | +/-3 | Stops one outlier dominating a composite | Apex-specific choice |
| SD floors | HRV 0.05 (ln), RHR 2 %, breathing 2 %, SpO2 0.5 pt, sleep duration 5 %, skin temp 0.2 degC, deep+REM share 0.03 | Prevent a run of identical readings turning a trivial change into a large z. Values are Apex's own | Apex-specific choice |
| 7-day EWMA, alpha = 0.25, seeded with its first reading; for HRV taken on ln scale and transformed back (v2) | span 7 | Plews 2013 uses a 7-day mean of ln RMSSD; EWMA weights recent days more (Apex). The ln-scale fix makes it comparable with the ln-scale range. | reasonable heuristic |
| Trend: least-squares line over the last 7 days, 4 readings minimum, "rising/falling" above 0.75 SD movement across the window (5 % of mean while calibrating) | 0.75 SD, 4 points, 5 % | Apex choice | Apex-specific choice |
| One reading per day, first listed wins (v2, same rule in baselines and trends) | - | Consistency fix, not physiology | Apex-specific choice |

### 2. Recovery score (`recovery/RecoveryEngine.kt`)

The inputs follow published practice (HRV and resting HR against a personal baseline: Plews 2013,
Buchheit 2014). The composite itself has **not** been validated against any outcome (injury, illness,
performance, subjective readiness).

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| Weights HRV / RHR / sleep / breathing / skin temperature | 0.40 / 0.25 / 0.25 / 0.05 / 0.05 | Apex: autonomic markers carry most weight because they are the best-supported recovery signals; breathing and temperature are stability checks | Apex-specific choice |
| Optional inputs: fatigue rating +0.10, workload ratio +0.05, joined by renormalisation | - | Apex | Apex-specific choice |
| Logistic map of z to 0-100, steepness 1.2 | 50 at baseline, ~77 at +1 SD | Apex: gives a smooth, bounded score | Apex-specific choice |
| Resting HR benefit stops at z = -2 | -2 | Apex: a very low RHR is not "extra recovered" (and can be a warning sign) | Apex-specific choice |
| Breathing and skin-temperature penalties start at z = 1; 40 points per SD high; 20 per SD low (temperature) | 1.0 / 40 / 20 | Apex | Apex-specific choice |
| Fatigue rating 1-10 mapped linearly to 100-0 | - | Apex | Apex-specific choice |
| Workload ratio: no penalty to 1.30, zero at 2.00 | 1.30 / 2.00 | Upper band from Gabbett 2016, contested by Impellizzeri 2020 | reasonable heuristic |
| Categories 0-33 / 34-66 / 67-100 | 34 / 67 | Thirds of the scale, as common in consumer products; not clinical | Apex-specific choice |
| Contributors listed when impact is at least 1 point | 1.0 | Presentation | Apex-specific choice |
| Non-finite input is treated as missing (v2) | - | Missing stays missing | not a physiological claim |
| An autonomic marker (HRV or RHR) is required | - | Sleep alone is not a recovery score (Apex rule) | Apex-specific choice |

### 3. Strain (`strain/`)

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| TRIMP per minute = dHR x a x e^(b x dHR), dHR = heart-rate reserve fraction | a = 0.64, b = 1.92 (men); a = 0.86, b = 1.67 (women) | Banister 1991; Morton 1990 | validated for training sessions in small athlete samples |
| Unspecified sex: mean of the two weightings | - | Apex: the user has not given a sex, neither curve is assumed | Apex-specific choice |
| Reserve floor | 0.30 of reserve | Apex: without it, 16 waking hours of low heart rate would swamp the day. Creates a step (0 to 0.34 men / 0.43 women per minute at the floor); the daily value stays non-decreasing in HR but is not continuous | Apex-specific choice |
| Daily TRIMP from one-minute heart-rate buckets of wrist data | - | Banister's TRIMP was defined for exercise sessions with chest-strap HR; wrist optical HR during intense or irregular movement can be inaccurate | reasonable heuristic |
| Strain = 21 ln(1 + TRIMP/20) / ln(1 + 600/20) | k = 20, ceiling 600, max 21 | Apex: logarithmic so each point is harder to earn. Hand-checked anchors (test): 30 min at 60 % reserve gives TRIMP 39.3 and strain 6.65; 60 min at 85 % gives 174.1 and 13.90; 3.5 h at 80 % gives 524.6 and 20.21 | Apex-specific choice |
| Zones at 50/60/70/80/90 % of HRmax (or of reserve, Karvonen) | 5 zones | Edwards 1993; Karvonen 1957 | reasonable heuristic (conventions) |
| HRmax = 208 - 0.7 age | - | Tanaka 2001 | validated (group mean; about 10 bpm individual error); labelled ESTIMATED |
| HRmax: user value wins (100-240 bpm); else the larger of the age prediction and the observed peak; with no age the observed peak alone (lower bound, so strain errs high) | - | A recorded HR above the prediction proves the prediction too low; a lower peak proves nothing. Apex logic | reasonable heuristic |
| Target strain = 6 + 12 x recovery/100, window +/-1 | 6 / 18 / 1 | Apex; guidance only, no source | Apex-specific choice |
| Remaining minutes use the engine's zone method and reserve floor (v2) | - | Consistency fix: minutes must refer to the zones the user sees | not a physiological claim |

### 4. Sleep (`sleep/`)

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| Adult sleep need range | 7-9 h (personal base is clamped to it) | Hirshkowitz 2015; Watson 2015 (at least 7 h) | validated as expert consensus (not an individual requirement) |
| Default base need | 7 h 45 min | Apex: inside the consensus range, slightly generous | Apex-specific choice |
| Personal base = 75th percentile of last 30 nights once 14 exist | 0.75 / 30 / 14 | Apex: a month of short nights shows a habit, not a need | Apex-specific choice |
| Strain surcharge | 3 min per strain point above 10 | Apex; no study gives a dose | Apex-specific choice |
| Debt: trailing 7 nights, repay 50 %, at most 90 min, one night repays at most 60 min, total need at most 10 h | 7 / 0.5 / 90 / 60 / 600 | Apex: sleep debt cannot be repaid in one night; caps prevent absurd prescriptions | Apex-specific choice |
| Score weights duration / restorative / efficiency / consistency | 0.40 / 0.25 / 0.20 / 0.15 | Apex | Apex-specific choice |
| Duration = min(100, 100 asleep/need) | - | Direct ratio to the need model | reasonable heuristic |
| Restorative share (deep + REM) benchmark | 38-50 % | Apex band, informed by typical adult stage distributions as reported by consumer wearables; wearable stages are not polysomnography stages. Penalty above 50 % (1 point per percentage point, at most 10) and personal nudge (5 points per SD, +/-2 SD) are Apex | Apex-specific choice |
| Efficiency anchors | 0 at 65 %, 100 at 92 % | Apex; 85 % is a commonly quoted lower limit of normal efficiency in the sleep literature (unverified) | Apex-specific choice |
| Wake-bout penalty | 2 free, 3 points each, at most 25 | Apex | Apex-specific choice |
| Consistency anchors | 100 up to 45 min SD, 0 at 150 min; at least 3 nights | Apex; circular statistics so midnight is handled correctly | Apex-specific choice |
| A night is "sufficient for recovery" at 90 % of need | 0.90 | Apex | Apex-specific choice |
| Sleep screen bands Poor / Sufficient / Optimal at 70 / 85 | 70 / 85 | Not from a study; see `FORMULAS.md` section 4 for the assessment and proposal | Apex-specific choice |

### 5. Training load (`load/TrainingLoadEngine.kt`, `stats/Ewma.kt`)

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| Acute 7-day and chronic 28-day exponentially weighted averages, alpha = 2/(N+1) | 7 / 28 | Williams 2017 | reasonable heuristic (team sport, other load measure) |
| Normalised weights instead of seeding with the first day (v2) | y = sum d^i x / sum d^i | Williams 2017 does not specify an initialisation; seeding made the chronic load depend on the first recorded day for weeks (see AUDIT). Converges to the recursive form after a long history | Apex-specific choice |
| Days without data skipped, not zero | - | Missing stays missing | not a physiological claim |
| Coupled ratio ATL/CTL after 14 days | 14 | Apex | Apex-specific choice |
| Uncoupled ratio (7-day mean / preceding 21-day mean), needs 28 days of history, 5 valid acute days, 14 valid chronic days | 28 / 5 / 14 | Coupling critique in Impellizzeri 2020; thresholds Apex | reasonable heuristic |
| Bands 0.80 / 1.30 / 1.50 | - | Gabbett 2016 (team sports, session-RPE/GPS load); contested; applied to TRIMP here, which was not studied | reasonable heuristic, contested |
| Caveats: history under 28 days, chronic load under 10 TRIMP/day, under 70 % of days recorded | 28 / 10 / 0.7 | Apex | Apex-specific choice |
| Monotony = mean / SD of the last 7 daily loads, strain = weekly load x monotony | needs 6 of 7 days; capped at 10 | Foster 1998 (defined on session-RPE load; here on TRIMP, not validated). The cap and the 6-day rule are Apex. | reasonable heuristic |
| Week-over-week change = relative change of mean recorded daily load, needs 5 recorded days in both weeks (v2) | 5 | Sums mistake missing wear time for a training drop; Apex | Apex-specific choice |
| Training balance = yesterday CTL - yesterday ATL | - | Convention of fitness-fatigue tools (Banister/Morton model family) | reasonable heuristic |
| Non-finite TRIMP counts as a missing day (v2) | - | Missing stays missing | not a physiological claim |

### 6. Fatigue signals (`recovery/FatigueSignals.kt`)

All thresholds are Apex calibration choices. The wording is "may indicate"; no signal is a diagnosis.

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| HRV acute drop | z <= -1.5 | Apex | Apex-specific choice |
| Resting HR elevated | z >= +1.5 | Apex | Apex-specific choice |
| Breathing rate elevated | z >= +2 | Apex | Apex-specific choice |
| Sustained: outside the normal range 3 or more consecutive days | 3 | Apex; HRV/RHR trends over several days are the pattern emphasised by Plews 2013 and Buchheit 2014 | reasonable heuristic |
| Weekly HRV average below range needs 3 readings in the last 7 days (v2) | 3 | Plews 2014 on required compliance (unverified); the number 3 is Apex's reading of it | reasonable heuristic |
| Level logic: none / watch / elevated / high | - | Independent systems agreeing over days is stronger evidence than one system on one day (Apex reasoning) | Apex-specific choice |

### 7. Fallback VO2 max (`fitness/CardioFitness.kt`)

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| VO2max = 15.3 x HRmax / HRrest | 15.3 | Uth 2004; derived in trained men, HRrest measured at rest; error of several ml/kg/min elsewhere; no sex adjustment in Apex | validated for the derivation group only; always labelled ESTIMATED |
| Accepted inputs | HRrest 25-120, HRmax 100-240 bpm | Plausibility range | Apex-specific choice |

## Open verification tasks

1. Open each source above and confirm author, year, journal, population and quoted error. Until then every row stays "unverified".
2. Confirm the Plews 2014 compliance finding before anyone describes the 3-reading rule as evidence-based.
3. Decide whether the 85 % efficiency anchor and the 38-50 % restorative band should be replaced by a cited normative table (they are Apex choices today).
