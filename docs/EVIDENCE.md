# Evidence register for formulas and constants

One entry per formula and constant in `:core:analytics` (algorithm version 3). Companion to
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
| Phillips 2017 | Phillips AJK et al. Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. Sci Rep 2017;7:3216 | Sleep Regularity Index (consistency, section 4) | 61 undergraduates, 30 days of diaries and actigraphy (bibliographic details confirmed by a web search in the 2026-11-12 review; the full text was not opened). Association with outcomes in students; not validated as a recovery input; unverified. |
| Plews 2013 | Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M. Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring. Sports Med 2013;43(9):773-781 | ln RMSSD as the HRV measure, weekly average of ln RMSSD | Review of endurance athletes; supports trend use against own baseline, not absolute cut-offs. |
| Plews 2014 | Plews DJ, Laursen PB, Le Meur Y, Hausswirth C, Kilding AE, Buchheit M. Monitoring training with heart-rate variability: how much compliance is needed for valid assessment? Int J Sports Physiol Perform 2014;9(5):783-790 | Why a weekly HRV mean needs several readings | Triathletes; recalled conclusion is that a small number of readings per week (about three) is enough for the weekly ln RMSSD mean. Unverified. |
| Buchheit 2014 | Buchheit M. Monitoring training status with HR measures: do all roads lead to Rome? Front Physiol 2014;5:73 | Resting HR and HRV against a personal baseline | Narrative review; individual thresholds, not population cut-offs. |
| Uth 2004 | Uth N, Sorensen H, Overgaard K, Pedersen PK. Estimation of VO2max from the ratio between HRmax and HRrest - the Heart Rate Ratio Method. Eur J Appl Physiol 2004;91(1):111-115 | VO2max = 15.3 x HRmax / HRrest | Derived in trained men; error of several ml/kg/min outside that group (recalled). |
| Hirshkowitz 2015 | Hirshkowitz M et al. National Sleep Foundation's sleep time duration recommendations: methodology and results summary. Sleep Health 2015;1(1):40-43 | 7-9 h adult range | Expert-panel review of the literature. |
| Watson 2015 | Watson NF et al. Recommended amount of sleep for a healthy adult: a joint consensus statement of the AASM and SRS. Sleep 2015;38(6):843-844 | "At least 7 h" for adults | Expert-panel consensus. |
| Ohayon 2017 | Ohayon M et al. National Sleep Foundation's sleep quality recommendations: first report. Sleep Health 2017;3(1):6-19 | The 85 % efficiency anchor of the v5 sleep score and the efficiency band | Expert-panel consensus; recalled, unverified. |
| Windred 2024 | Windred DP et al. Sleep regularity is a stronger predictor of mortality risk than sleep duration: a prospective cohort study. Sleep 2024;47(1):zsad253 | Context only: a typical adult SRI around 80 (UK Biobank accelerometry, about 60,000 adults) | Recalled, unverified; association, not an individual cut-off. |
| Rousseeuw 1993 | Rousseeuw PJ, Croux C. Alternatives to the median absolute deviation. J Am Stat Assoc 1993;88(424):1273-1283 | MAD x 1.4826 as a robust SD (robust baselines, D16) | Statistics; recalled, unverified. |
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
| Weighted mean over HRV / RHR / sleep (and the optional fatigue rating), weights 0.40 / 0.25 / 0.25 (+0.10), renormalised over those present (v3) | - | Apex: autonomic markers carry most weight because they are the best-supported recovery signals | Apex-specific choice |
| Breathing, skin temperature, workload ratio are additive penalties `0.05 * (100 - S)`, never part of the mean (v3) | 0.05 each, at most 5 points | Apex. Version 2 renormalised them with a neutral 100, so a missing sensor changed the score (B1). Same structure as the reference app's additive adjustments | Apex-specific choice |
| The workload ratio is used only when it carries no caveat (v3) | - | A ratio flagged unreliable (short history, low chronic load, sparse data) must not feed another score | Apex rule |
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
| HRmax: user value wins (100-240 bpm); else the larger of the age prediction and the robust observed maximum; with no age the observed value alone (lower bound, so strain errs high) | - | A sustained HR above the prediction proves the prediction too low; a lower peak proves nothing. Apex logic | reasonable heuristic |
| Robust observed maximum = 99.5th percentile of one-minute averages in 100-240 bpm over 180 days, at least 600 such minutes (v3) | 0.995 / 600 / 100 / 240 / 180 d | Apex. The percentile of artefact-filtered exercise heart rate, never below the age prediction, follows the reference app's scoring code. Replaces the single highest minute (B5), which one optical glitch could set | Apex-specific choice |
| TRIMP resting anchor = resting-HR baseline centre, one resting series per 30-day window (v3) | - | Consistency: a morning 8 bpm above usual must not change every minute of a day (B10); the Bevel study also anchors on the baseline | Apex rule |
| A day is a load day only with at least 600 recorded minutes; today never (v3) | 600 | Apex calibration: a partly synced day is missing data, not a rest day (B2, B3). No source | Apex-specific choice |
| Target strain (v3) = 14-day EWMA (alpha 0.25) of recorded strain x (1 + 0.6 (R - 50)/100), window +/-1, at least 5 recorded days | 14 / 0.25 / 0.6 / 1 / 5 | Form and the 14-day alpha-0.25 fold from the Bevel study (not peer reviewed); Apex skips missing days where the study zero-fills; guidance only | Apex-specific choice |
| Remaining minutes use the engine's zone method and reserve floor (v2) | - | Consistency fix: minutes must refer to the zones the user sees | not a physiological claim |

### 4. Sleep (`sleep/`)

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| Adult sleep need range | 7-9 h (personal base is clamped to it) | Hirshkowitz 2015; Watson 2015 (at least 7 h) | validated as expert consensus (not an individual requirement) |
| Default base need | 7 h 45 min | Apex: inside the consensus range, slightly generous | Apex-specific choice |
| Personal base = 75th percentile of last 30 nights once 14 exist | 0.75 / 30 / 14 | Apex: a month of short nights shows a habit, not a need | Apex-specific choice |
| Strain surcharge (v3) | `base * 0.02 * max(0, z)`; z of yesterday's strain against the last 30 recorded days (at least 7, SD floor 1 point, z cap 3) | Apex. The personal-z form and 2 % per SD are those of the Bevel study (reverse-engineered, not peer reviewed); no study gives a dose. Replaces 3 min per point above 10, which depended on Apex's own strain scale | Apex-specific choice |
| Debt: trailing 7 nights, repay 50 %, at most 90 min, one night repays at most 60 min, total need at most 10 h | 7 / 0.5 / 90 / 60 / 600 | Apex: sleep debt cannot be repaid in one night; caps prevent absurd prescriptions | Apex-specific choice |
| Debt unknown below 4 recorded nights; naps count as sleep (v3) | 4 | Apex: a debt from one night is not a debt; naps are sleep (the Bevel study also counts them) | Apex-specific choice |
| Score weights (v5) duration / restoration / stage quality / efficiency / consistency | 0.35 / 0.25 / 0.15 / 0.15 / 0.10 | Apex (D15): the owner's 96-vs-70 night; parts set so an ordinary night sits near 80 | Apex-specific choice |
| Duration (v5): target = max(need, 420 min); 0 at target - 225 min, linear to 100 | 420 / 225 | 420: Watson 2015 (adult minimum). 225 and the ramp: Apex | validated as expert consensus (420) / Apex-specific choice (ramp) |
| Restoration (v5): mean(-z sleeping HR, z ln RMSSD) minus 0.5 per SD of breathing rate above +1; 80 at z = 0, +20 per SD above, -30 per SD below; z clamp 3 | 80 / 20 / 30 / 1 / 0.5 / 3 | Direction (lower overnight HR, higher ln RMSSD than one's own baseline = better recovered): Plews 2013, Buchheit 2014. Every constant: Apex. Not validated against any outcome | reasonable heuristic (direction) / Apex-specific choice (constants) |
| Stage quality (v5): 80 + 10 per SD of deep + REM share against the personal baseline; 38-50 % band worth at most 80 only while calibrating | 80 / 10 / 0.38-0.50 | Apex; consumer-wearable stages are not polysomnography stages, so the absolute share is only provisional | Apex-specific choice |
| Efficiency anchors (v5) | 0 at 65 %, 75 at 85 %, 100 at 95 % | 85 %: Ohayon 2017 "good sleep quality" indicator (unverified). 65/95: Apex | reasonable heuristic (85 %) / Apex-specific choice |
| Wake-bout penalty | 2 free, 3 points each, at most 25 | Apex | Apex-specific choice |
| Result confidence (v5): HIGH from 0.85 of the weight, MEDIUM from 0.60 | 0.85 / 0.60 | Apex | Apex-specific choice |
| Recovery takes the behavioural sleep score (v5) | - | Apex: avoids counting overnight HRV / HR / breathing rate twice | Apex-specific choice |
| Consistency = Sleep Regularity Index over consecutive-day minute pairs, noon-to-noon windows, naps count, uncovered days skipped, at least 2 usable pairs; sub-score `max(0, SRI)` (v3) | 7 windows / 2 pairs | Phillips 2017 (the index; unverified). Windows, the skip rule, the pair minimum and the 0-100 mapping are Apex. Replaces the 45/150-minute SD anchors, which were Apex's own | reasonable heuristic (index) / Apex-specific choice (mapping) |
| A night is "sufficient for recovery" at 90 % of need | 0.90 | Apex | Apex-specific choice |
| Sleep screen bands (v5, `SleepBands`): 70 / 85 on the score, capped at Sufficient below 90 % and Poor below 70 % of the duration target; per-row rules in `FORMULAS.md` section 4 | 70 / 85 / 0.90 / 0.70 | Not from a study; aligned with the v5 scale | Apex-specific choice |
| Dual baselines (D16): mean/SD for composite scores, median/MAD (x1.4826, floors) for anomaly and multi-signal checks | 30 d / 7 and 28 d / 14 | Rousseeuw & Croux 1993; Leys et al. 2013 (robust statistics, unverified); not validated for wearable health monitoring | reasonable heuristic |

### 5. Training load (`load/TrainingLoadEngine.kt`, `stats/Ewma.kt`)

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| Acute 7-day and chronic 28-day exponentially weighted averages, alpha = 2/(N+1) | 7 / 28 | Williams 2017 | reasonable heuristic (team sport, other load measure) |
| Normalised weights instead of seeding with the first day (v2) | y = sum d^i x / sum d^i | Williams 2017 does not specify an initialisation; seeding made the chronic load depend on the first recorded day for weeks (see AUDIT). Converges to the recursive form after a long history | Apex-specific choice |
| Days without data skipped, not zero | - | Missing stays missing | not a physiological claim |
| Coupled ratio ATL/CTL after 14 days of history and 14 recorded days in the last 28 (v3) | 14 / 14 | Apex | Apex-specific choice |
| Load confidence = min(density, recency); calibrating below 0.35 (v3) | 28 active days in 42; 16-day recency, 0.0625 per day; active = load over 5 TRIMP; 0.35 | The Bevel study's gate (reverse-engineered, not peer reviewed), adapted to recorded days; the constants are another app's calibration | Apex-specific choice |
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
| Weekly HRV status (v3): 7-night ln mean against the 60 nights before the week; at least 4 week nights and 21 baseline nights; balanced within 0.75 SD, markedly below under 1.5 SD; SD floor 0.05; the signal is raised below the balanced range | 7 / 60 / 4 / 21 / 0.75 / 1.5 / 0.05 | ln RMSSD weekly mean: Plews 2013, Plews 2014 on compliance (both unverified). A baseline that ends before the week: Apex (probe G2). The thresholds are the reference app's own guesses; its code comments call 4 nights and the SD multiples guesses | reasonable heuristic / Apex-specific choice |
| Fatigue is not evaluable when neither HRV nor RHR has a z-score and no signal exists (v3) | - | Missing stays missing: a calibrating baseline is not "no signals" | not a physiological claim |
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

## Pulse parity engines (goals, weekly plan, report, blood pressure, nutrition, breathing, spot HRV)

Written 2026-11-13 by the sports-science reviewer. **No paper was opened in this session**; every citation below is recalled and UNVERIFIED. These engines are display-time
arithmetic over plain inputs (no stored score, no algorithm-version bump). The Pulse repository was used for behaviour only (nothing copied; Pulse is PolyForm Noncommercial). The engines' rules are listed in `docs/FORMULAS.md`, "Pulse parity engines".

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| Recovered day = recovery >= 67 | 67 | Reuses the recovery engine's PEAK edge (Apex calibration, section 2 above) | Apex-specific choice |
| Goal streak, achieved-when `>=`, provisional today | - | Product conventions; no study | Apex-specific choice |
| Weekly plan template, factors (1.3 / 1.0 / 0.7 / 0.4), at most 3 HARD, no back-to-back HARD, at least 1 REST, first-day limits (recovery < 34, HIGH_RISK -> REST, OVERREACHING -> LIGHT) | see FORMULAS P2 | Alternating hard and easy days is common coaching practice (no source opened); 1.3 / 0.7 mirror `StrainTargetCalculator`; ratio-zone limits carry the Impellizzeri 2020 caveat (section Sources). No study validates this plan | Apex-specific choice; suggestion only |
| Report: change needs >= 4 recorded days per period; SPARSE below 50 % coverage | 4 / 0.5 | Apex choices (a mean of fewer days is dominated by one value) | Apex-specific choice |
| Blood-pressure categories | Normal < 120/80; Elevated 120-129 and < 80; Stage 1 130-139 or 80-89; Stage 2 >= 140 or >= 90; Crisis > 180 and/or > 120 | **UNVERIFIED**: Whelton PK et al. 2017 ACC/AHA/AAPA/ABC/ACPM/AGS/APhA/ASH/ASPC/NMA/PCNA Guideline for the Prevention, Detection, Evaluation, and Management of High Blood Pressure in Adults. Hypertension 2018;71(6):e13-e115 (also J Am Coll Cardiol 2018;71(19):e127-e248). Adults; defined on the average of >= 2 careful readings on >= 2 occasions. The Crisis cut-off is recalled from AHA public material, not the guideline text | published categories, citation unverified; a label, not a diagnosis |
| Averaging needs >= 3 readings; mean rounded to whole mmHg; plausibility 50-300 / 30-200 | 3 / half-up / ranges | The guideline asks for >= 2 readings on >= 2 occasions; the rest is Apex handling of user-typed numbers | Apex-specific choice |
| Atwater factors 4 / 4 / 9 kcal per g | 4, 4, 9 | **UNVERIFIED**: Atwater WO, Bryant AP (1900), USDA general factors; rounded averages, fibre about 2 kcal/g, alcohol 7 kcal/g not modelled; label energy can differ | reasonable heuristic |
| Energy balance = intake - measured expenditure | - | Arithmetic; wearable expenditure error is of the order of 10 % or more (recalled, UNVERIFIED); intake logging is typically under-reported (recalled, UNVERIFIED) | context only |
| Breathing patterns box 4-4-4-4, 4-7-8, coherent 5.5 s, extended exhale 4-6 | as named | Conventional names of the patterns. Coherent breathing at about 5.5 breaths per minute: Lehrer PM, Gevirtz R. Front Psychol 2014;5:756 (recalled, UNVERIFIED). No health effect is claimed by Apex | pacing timer |
| Physiological sigh durations 2 s + 1 s in, 6 s out | 2 / 1 / 6 | **Calibration choice**; the existence of a double-inhale breathing pattern is described in the literature (recalled, not opened); durations were not sourced | Apex-specific choice |
| RMSSD definition | sqrt(mean of squared successive RR differences) | Task Force of the ESC and NASPE (1996), Heart rate variability: standards of measurement. Circulation 93(5):1043-1065 (recalled, UNVERIFIED) | validated standard, citation unverified |
| Ultra-short (about 60 s) RMSSD | needs >= 60 s and >= 30 beats | Esco MR, Flatt AA (2014), Ultra-short-term HRV in athletes. J Sports Sci Med 13:535-541 (recalled, UNVERIFIED; the 60 s floor is an Apex choice, not their number) | Apex-specific choice, loosely supported |
| Artifact rule: RR in 300-2000 ms, > 20 % from the 5-beat median | 300 / 2000 / 5 / 20 % | Common practice in HRV tools; no validation opened | Apex-specific choice |

Open verification tasks for these engines: (1) open Whelton 2018 and confirm the five category thresholds and the crisis cut-off before any wording quotes them; (2) confirm the 4/4/9 factors against a nutrition reference; (3) find a source for the sigh
timing or keep it labelled a calibration choice in the UI; (4) decide whether the weekly template should vary with the strain base (it does not today).

## Health age (`healthage/HealthAge.kt`, experimental, D13)

Written 2026-11-13. **No paper was opened.** PubMed, PMC and the UCL repository did not resolve from this session; the figures below come from web-search result summaries (secondary, not the papers) and are UNVERIFIED.
Every constant is a calibration choice. The conversion "years = ln(HR) / ln 2 * 8" uses a Gompertz mortality-rate doubling time of about 8 years in adults (recalled, UNVERIFIED; commonly quoted 8-10 years). All sources are observational
associations with all-cause mortality (reverse causation and confounding likely) and none validated an individual "age". The Google Research coachable health-age (CKM) blog has no public formula: design inspiration only, not implemented.

| Item | Value | Source or reason | Grade |
|---|---|---|---|
| Resting HR: 1.0 year per 10 bpm around 65 bpm, cap +/-3 | 65 / 1.0 / 3 | Zhang D, Shen X, Qi X. CMAJ 2016;188(3):E53-E63, meta-analysis of 46 prospective general-population cohorts: RR 1.09 (95 % CI 1.07-1.12) all-cause mortality per 10 bpm; 60-80 bpm RR 1.12, > 80 bpm RR 1.45 versus the lowest category (search summary, UNVERIFIED). ln(1.09)/ln 2 * 8 is about 1.0 year. The 65 bpm reference and the cap are calibration. Substantial heterogeneity and publication bias reported by the authors; low RHR in trained people is a training effect, not the same exposure | Apex-specific choice |
| Steps: reference 7,000; +0.75 year per 1,000 below, -0.5 year per 1,000 above; caps +3 / -1.5 | as stated | Paluch AE et al. Lancet Public Health 2022;7(3):e219-e228, 15 cohorts, about 50,000 adults: HR 0.60 / 0.55 / 0.47 for quartiles 2-4 versus the lowest; benefit levels off around 6,000-8,000 steps (age 60+) and 8,000-10,000 (younger) (search summary, UNVERIFIED). Taken literally the HRs would imply far larger years; slopes are deliberately damped to about a third to a half because of reverse causation (people who are ill walk less). Saturation is why the younger side is small | Apex-specific choice |
| Sleep duration: 0 in 7-9 h; +0.65 year per hour below 7 (cap 2); +1.0 year per hour above 9 (cap 3) | as stated | Cappuccio FP et al. Sleep 2010;33(5):585-592, 16 prospective studies, 1.38 million people: short sleep RR 1.12 (1.06-1.18), long sleep RR 1.30 (1.22-1.38) (search summary, UNVERIFIED); cut-offs varied across studies (about <= 6 h and >= 9 h in a press summary). 7-9 h is the Watson 2015 / Hirshkowitz 2015 adult recommendation (recalled, UNVERIFIED). Self-reported sleep in those studies; long sleep is likely a marker of illness, so it is not a goal | Apex-specific choice |
| Sleep regularity: 1.0 year per 10 SRI points around 75, cap +/-2.5 | 75 / 1.0 / 2.5 | Windred DP et al. Sleep 2024;47(1):zsad253, UK Biobank, 60,977 accelerometer participants, up to 7.8 years follow-up: more regular quintiles 20-48 % lower all-cause mortality than the least regular; an earlier abstract gave 20.4 % lower hazard per +10.7 SRI (search summary, UNVERIFIED). Taken literally that is about 2.6 years per 10 points; damped to 1.0. The 75 reference is not a published norm. SRI after Phillips 2017 (see section 4) | Apex-specific choice |
| BMI: +0.5 year per unit above 25, cap +4; nothing below | 25 / 0.5 / 4 | Global BMI Mortality Collaboration, Lancet 2016;388:776-786, 239 cohorts, 10.6 million adults: reference 22.5-<25; HR 1.07 for 25-<27.5, 1.45 for 30-<35, 1.94 for 35-<40 (search summary, UNVERIFIED). 27.5 gives +1.25 years (HR 1.07 implies about 0.8), 32.5 gives +3.75 (HR 1.45 implies about 4.3). Association steeper in younger people and men. BMI mislabels muscular athletes; underweight HRs not checked, so that side is not modelled | Apex-specific choice |
| VO2 max: 0.25 year per year of fitness age, cap +/-5 | 0.25 / 5 | Fitness age reused from `FitnessAge` (FRIEND median curve, Kaminsky 2015, UNVERIFIED transcription; see FORMULAS 8.7). Mortality scale: Kodama S et al. JAMA 2009;301(19):2024-2035, about 13 % lower all-cause mortality per 1 MET higher fitness (recalled, UNVERIFIED), about 1.6 years per MET, against about 7.6 fitness-age years per MET in the FRIEND male medians (4.6 ml/kg/min per decade = 1.3 MET), ratio about 0.2, rounded up to 0.25. A wearable VO2 max errs by several ml/kg/min (several fitness-age years) | Apex-specific choice |
| Total cap +/-10 years; per-factor days 14 (1 for VO2 max and BMI); gate: VO2 max or 3 of 4 day-series factors | 10 / 14 / 3 | Product choices so no single measure or short window dominates; 14 days matches the personal-baseline window (sections 1 and 7). No study | Apex-specific choice |
| HRV not scored | - | No age/sex RMSSD reference table is in the codebase and none was opened (Nunan 2010 short-term HRV norms exist, UNVERIFIED, not used); the personal ln(RMSSD) baseline already drives recovery. Withheld rather than guessed | by omission |

Open verification tasks: (1) open Zhang 2016, Paluch 2022, Cappuccio 2010, Windred 2024 and the GBMC 2016 paper and confirm the numbers above; (2) confirm the mortality-rate doubling time; (3) decide, with the owner, whether the 0.25 VO2 weight and the damping of the steps and
sleep-regularity slopes should be tightened; (4) if an age-and-sex HRV reference is opened and checked, add HRV as a scored factor (bump FORMULAS, add vectors).
