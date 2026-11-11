# Phase 35: Functional Gaps — Goose vs my-whoop

**Reviewed:** 2026-06-08
**Scope:** Features present in my-whoop Python reference but absent or incomplete in Goose v5.0 Rust.

---

## Gap Classification

- **IN_ROADMAP**: Gap is acknowledged in existing planning documents or phase roadmap.
- **BACKLOG**: Gap exists, not yet planned; candidate for v6.0+.

---

## Functional Gaps

### G-01: Resting HR derived from sleep HR stream (not passed in)

**my-whoop:** `recovery.py::resting_hr()` computes resting HR internally from the HR stream
using 5-minute rolling-mean windows, returning the minimum bin. No caller pre-computation
required.

**Goose:** `RecoveryInput.resting_hr_bpm` is a required field — the caller must pre-compute it.
No internal derivation from the HR stream.

**Status:** IN_ROADMAP — the energy rollup and exercise detection paths have HR-stream access.
The recovery bridge call must eventually support on-demand derivation.

---

### G-02: Winsorized EWMA baseline with outlier rejection

**my-whoop:** `baselines.py::update_baseline()` implements: physiological bounds gate → hard
outlier rejection (HARD_OUTLIER_K=5) → Winsorization (WINSOR_K=3) before EWMA update.

**Goose:** `baselines.rs::EwmaState::fold()` applies no bounds gate, no outlier rejection, and
no Winsorization. Only non-finite values are filtered.

**Status:** BACKLOG — one outlier night permanently corrupts the Goose EWMA. This is a robustness
gap, not a correctness gap for typical data. Prioritize before promoting recovery scores to
production users.

---

### G-03: Recovery score logistic formula

**my-whoop:** `recovery.py::recovery_score()` uses a z-score + logistic squash to produce a
score calibrated to WHOOP's published 58% population average at Z=0.

**Goose:** `goose_recovery_v0()` uses a linear weighted sum with a 70% neutral point.

**Status:** BACKLOG — the Goose v0 algorithm is explicitly "experimental". A v1 recovery
algorithm using the logistic formula is a natural next version.

---

### G-04: Kubios ectopic beat correction

**my-whoop:** `hrv.py::clean_rr()` uses `neurokit2.signal_fixpeaks(method="kubios")` for
interpolation-based ectopic beat correction.

**Goose:** `goose_hrv_v0()` uses a custom Lipponen-Tarvainen median-relative rejection
(drop-and-flag, not interpolation).

**Status:** BACKLOG — porting Kubios to Rust is significant work. The current drop-and-flag
approach is documented and flagged. Noted in ALG-HRV-04 cross-validation gate.

---

### G-05: Exercise session kind classification (run/cycle/lift/etc.)

**my-whoop:** `exercise.py::ExerciseSession.kind` is documented as deferred pending Task 1.4
(raw accel sample). No classification implemented.

**Goose:** `exercise_detection.rs::ExerciseSession.device_id` is set to empty string;
no `kind` field exists in the struct.

**Status:** IN_ROADMAP — both projects defer this to raw accelerometer classifier work.

---

### G-06: Sleep staging at 30-second epochs

**my-whoop:** Uses 30-second epoch grid throughout the staging pipeline (te Lindert 2013 variant).

**Goose:** Uses 1-minute epochs (`COLE_KRIPKE_EPOCH_MINUTES = 1.0`).

**Status:** BACKLOG — 30-second resolution improves SOL/WASO precision by 2x. Requires changing
the epoch constant and revalidating Cole-Kripke coefficients for the 30-s timescale.

---

### G-07: Sleep staging: respiration rate variability (RRV) and DoG HR-variability

**my-whoop:** Uses Walch DoG HR-variability feature and respiration rate variability from the
`sleep_features` module as staging signals.

**Goose:** Uses HR percentile (p25, median) and clock-proxy only for 4-class staging.
No RRV or DoG feature.

**Status:** BACKLOG — improving 4-class accuracy beyond the current Cole-Kripke + HR-heuristic
approach. Requires RR interval stream quality and resp_samples.

---

### G-08: Strain logarithmic scaling (v0 only uses linear)

**my-whoop:** Always uses `21 * ln(TRIMP+1) / ln(D)` logarithmic map.

**Goose v0:** Uses linear map `zone_load / 20.0`, clamped to 21.

**Status:** IN_ROADMAP — Goose v1 adds the logarithmic Banister path. v0 is legacy; v1 is
preferred for new callers. Document v0 deprecation.

---

### G-09: Per-sample HR-based calorie computation in exercise (vs zone-midpoint)

**my-whoop:** `calories.py::estimate_bout_calories()` evaluates Keytel per-sample using exact
HR; per-second rate.

**Goose exercise_detection:** Uses Keytel at `avg_hr` for the entire session (single evaluation
for all "active" samples), not per-sample. This underestimates calories during high-variability
workouts.

**Status:** BACKLOG — per-sample computation is more accurate. Not a large effect for steady-
state cardio but matters for interval workouts.

---

### G-10: Server-side data persistence / sync pipeline

**my-whoop:** Full FastAPI + TimescaleDB server with `ingest` service.

**Goose:** iOS client only; no server upload implemented.

**Status:** IN_ROADMAP (original milestone requirement).

---

## Summary

| Gap | Severity | Status |
|-----|----------|--------|
| G-01: Resting HR derivation | LOW | IN_ROADMAP |
| G-02: EWMA outlier gates | HIGH | BACKLOG |
| G-03: Recovery logistic formula | MEDIUM | BACKLOG |
| G-04: Kubios ectopic correction | MEDIUM | BACKLOG |
| G-05: Exercise kind classification | LOW | IN_ROADMAP |
| G-06: 30-second sleep epochs | MEDIUM | BACKLOG |
| G-07: RRV + DoG HR feature for staging | MEDIUM | BACKLOG |
| G-08: v0 strain linear vs log map | LOW | IN_ROADMAP |
| G-09: Per-sample calorie computation | LOW | BACKLOG |
| G-10: Server-side sync pipeline | HIGH | IN_ROADMAP |
