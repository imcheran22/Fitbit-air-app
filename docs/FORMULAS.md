# Formulas

Every number the app computes, with the exact formula and the constants in use. All of it lives
in `:core:analytics` and is covered by unit tests. Formula set version: **1**
(`ANALYTICS_ALGORITHM_VERSION`).

These are this app's own calculations. They are not WHOOP, Oura, Garmin or Fitbit scores, and
they are not medical measurements. Constants marked *calibration* set where typical days land on
a scale; they are design choices, not physiology, and are configurable in code.

## 1. Personal baselines

For a metric X evaluated on day D:

- **Baseline window:** the 30 days before D (D−30 … D−1). Day D itself is excluded, so today's
  reading is never compared against an average it helped to form.
- **μ30, σ30:** mean and sample standard deviation (n−1) of the valid readings in the window.
- **Calibration:** at least 7 valid days are required. Below that the baseline is `CALIBRATING`
  and every score that depends on it stays locked rather than falling back to population norms.
- **Z-score:** `Z = (x − μ30) / σ30`, clamped to [−3, +3].
- **σ floor:** σ30 is never allowed below a small floor, so a run of near-identical readings
  cannot turn a trivial change into an extreme Z.
- **Personal normal range:** μ30 ± 1σ30.
- **7-day EWMA:** `EWMA_t = α·x_t + (1−α)·EWMA_(t−1)`, `α = 2/(7+1) = 0.25`. Days without a
  reading leave the average unchanged.

| Metric | Scale | σ floor |
|---|---|---|
| HRV (RMSSD) | natural log | 0.05 (≈5 %) |
| Resting heart rate | linear | 2 % of mean |
| Breathing rate | linear | 2 % of mean |
| SpO2 | linear | 0.5 points |
| Sleep duration | linear | 5 % of mean |
| Skin temperature deviation | linear | 0.2 °C |
| Deep + REM share | linear | 0.03 |

**Why HRV uses a log scale.** RMSSD is right-skewed and changes proportionally, so the baseline
is computed on ln(RMSSD) (Plews et al. 2013). The typical value shown is the geometric mean
`e^μ`, and the normal range `e^(μ±σ)` is therefore slightly wider above than below.

**Trend direction.** A least-squares line is fitted to the readings of the last 7 days (at least
4 needed). The trend is rising or falling when the line moves by more than 0.75 σ across the
window, otherwise stable.

## 2. Recovery score (0–100)

`Recovery = Σ wᵢ′ · Sᵢ` over the inputs that are available.

| Input | Weight | Sub-score Sᵢ (0–100) |
|---|---|---|
| HRV | 0.40 | `100 / (1 + e^(−1.2·Z))` |
| Resting heart rate | 0.25 | `100 / (1 + e^(1.2·Z′))`, `Z′ = max(Z, −2)` |
| Sleep | 0.25 | the sleep score (section 4) |
| Breathing rate | 0.05 | `100 − 40·max(0, Z − 1)` |
| Skin temperature | 0.05 | `100 − 40·max(0, Z − 1) − 20·max(0, −Z − 1)` |
| Fatigue rating (optional) | +0.10 | `100·(10 − rating)/9`, rating 1 (fresh) … 10 (exhausted) |
| Workload ratio (optional) | +0.05 | 100 up to a ratio of 1.30, falling linearly to 0 at 2.00 |

- The logistic curve gives 50 at the personal baseline, about 77 at +1σ and 23 at −1σ.
- A resting heart rate lower than usual helps only down to −2σ.
- Breathing rate and skin temperature are stability checks: they can only take points away.

**Missing inputs.** `wᵢ′ = wᵢ / Σ wⱼ` over the available inputs. A missing sensor's weight is
shared out in proportion among the rest, so the score always spans 0–100 and is never capped
(without skin temperature, HRV carries 0.40/0.95 = 0.421, and so on). The two optional inputs
join the same renormalisation only when present.

**No guessing.** At least one of HRV or resting heart rate is required. With neither, the result
is `CALIBRATING` (baselines still forming) or `UNAVAILABLE`.

**Categories.** 67–100 Peak (train hard) · 34–66 Moderate (maintain) · 0–33 Restorative
(prioritise recovery).

**Contributors.** Each input's effect is reported as `wᵢ′·(Sᵢ − neutral)`, with neutral = 50 for
HRV, resting heart rate and the fatigue rating, 75 for sleep, 100 for the penalty-only inputs.

## 3. Cardiovascular strain (0–21)

Shown as **DERIVED CARDIO STRAIN (0–21 SCALE)**.

**Heart-rate reserve fraction:** `ΔHR = (HR − HRrest) / (HRmax − HRrest)`, limited to 0…1.

**TRIMP per minute (Banister):** `ΔHR · a · e^(b·ΔHR)`
with a = 0.64, b = 1.92 (men); a = 0.86, b = 1.67 (women); the average of both when sex is not
given. Minutes with ΔHR below 0.30 are ignored so that sixteen waking hours of sitting and
walking do not swamp real training.

**Daily TRIMP:** the sum over every one-minute heart-rate bucket of the day.

**Scale:** `Strain = 21 · ln(1 + TRIMP/20) / ln(1 + 600/20)`, capped at 21.
(20 and 600 are *calibration*: an easy 30-minute jog lands near 6, a hard hour near 14, a
marathon-sized day near 20.)

**Heart-rate zones:** lower limits at 50/60/70/80/90 % of HRmax (zones 1–5). A heart-rate-reserve
(Karvonen) variant is available.

**HRmax:** a value the user enters wins. Otherwise the higher of the age prediction
`208 − 0.7·age` (Tanaka et al. 2001, labelled ESTIMATED) and the highest one-minute average the
wearable has recorded.

**Target strain from recovery:** `center = 6 + 12·(Recovery/100)`, window = center ± 1.
Remaining capacity = TRIMP at the window's upper edge − TRIMP so far, also converted into
minutes at the midpoint of each zone.

## 4. Sleep

### Sleep need

`need = base + strain surcharge + debt surcharge`, at most 10 h.

- **Base:** 7 h 45 min, or once 14 nights exist the 75th percentile of the last 30 nights, kept
  within 7–9 h (a month of short nights shows a habit, not a small need).
- **Strain surcharge:** 3 min (0.05 h) per strain point above 10 on the preceding day.
- **Debt surcharge:** 50 % of the accumulated debt, at most 90 min. (The cap is a safeguard
  added to the specification: without it a week of six-hour nights would prescribe a
  fourteen-hour night.)

### Sleep debt

Sum over the trailing 7 nights of `(base + strain surcharge) − time asleep`. A long night repays
at most 60 min; nights without data are skipped; the total is never negative.

### Sleep score (0–100)

| Component | Weight | Sub-score |
|---|---|---|
| Duration | 0.40 | `min(100, 100 · asleep / need)` |
| Restorative stages | 0.25 | share of deep + REM: 100 within 38–50 %; `100·share/0.38` below; minus 1 point per percentage point above 50 % (at most 10); then ±5 points per σ versus the personal usual (limited to ±2σ) |
| Efficiency | 0.20 | `asleep / in bed`: 0 at 65 %, 100 at 92 %, linear between; minus 3 points per awakening longer than 3 min beyond the first two (at most 25) |
| Consistency | 0.15 | mean of the 7-day standard deviations of bedtime and wake time: 100 up to 45 min, falling linearly to 0 at 150 min |

Bedtime spread is computed on the clock face (circular statistics), so 23:50 and 00:10 are
20 minutes apart. Components that cannot be computed (no stage data, fewer than 3 nights of
timing) drop out and the remaining weights are scaled up, exactly as for recovery. A night counts
as sufficient for recovery when it covers at least 90 % of the need.

## 5. Training load

Built on daily TRIMP. A day with no heart-rate data is treated as unknown and leaves the averages
unchanged; a recorded day with no load counts as zero.

- **Acute load (ATL, "fatigue"):** 7-day EWMA, α = 2/8.
- **Chronic load (CTL, "fitness"):** 28-day EWMA, α = 2/29.
- **Coupled ratio:** `ATL / CTL`. Reported once 14 days of history exist.
- **Uncoupled ratio:** mean of the last 7 days ÷ mean of the 21 days before them. Needs 28 days
  of history, at least 5 valid days in the acute week and 14 in the chronic window. Because the
  acute week is not part of its own denominator, a spike shows at full size.
- **Bands:** below 0.80 under usual load · 0.80–1.30 sweet spot · 1.31–1.49 overreaching
  caution · 1.50 and above high fatigue risk.
- **Training balance:** yesterday's CTL − yesterday's ATL (positive = fresh).
- **Foster's monotony:** mean ÷ sample standard deviation of the last 7 daily loads (capped at
  10 when the days are nearly identical). **Foster's strain:** weekly load × monotony.

**Caveats shown with the ratio:** short history (under 28 days), low chronic load (under
10 TRIMP/day, where small changes swing the ratio), sparse data (under 70 % of days recorded).

The link between specific ratio bands and injury is contested in the literature
(Impellizzeri et al. 2020). The bands are load-management guidance, not injury prediction.

## 6. Fatigue indicators

| Signal | Rule |
|---|---|
| HRV acute drop | Z ≤ −1.5 |
| HRV sustained suppression | below the normal range 3+ days running |
| HRV weekly average below range | 7-day EWMA under the lower edge |
| Resting heart rate elevated | Z ≥ +1.5 |
| Resting heart rate sustained elevation | above the normal range 3+ days running |
| Breathing rate elevated | Z ≥ +2 |

Level: none · watch (one system, one day) · elevated (HRV and heart rate agree, or a sustained
signal) · high (both agree and at least one is sustained). These describe physiological load;
they do not diagnose anything.

## 7. Fallback VO2 max estimate

Only when the wearable has not reported a VO2 max: `15.3 · HRmax / HRrest` (Uth et al. 2004),
always labelled ESTIMATED. It was validated on trained men and is suitable for following a
trend, not as an absolute value.

## References

- Banister EW (1991). Modeling elite athletic performance.
- Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome.
- Impellizzeri FM et al. (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls.
- Plews DJ et al. (2013). Training adaptation and heart rate variability in elite endurance athletes.
- Tanaka H, Monahan KD, Seals DR (2001). Age-predicted maximal heart rate revisited.
- Uth N et al. (2004). Estimation of VO2max from the ratio between HRmax and HRrest.
- Williams S et al. (2017). Better way to determine the acute:chronic workload ratio?
