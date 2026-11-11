# Phase 123 — Multi-AI Plan Review

**Plan:** `123-01-PLAN.md`
**Reviewers:** A (Codex perspective) + B (Claude adversarial perspective), run in parallel
**Date:** 2026-06-28
**Verdict:** REQUEST_CHANGES (both reviewers agree)
**HIGH count:** 4 unique high-severity findings

---

## CYCLE_SUMMARY

```
high_count: 4
verdict: REQUEST_CHANGES
```

---

## Merged Findings

Findings are deduplicated across both reviewers. Overlapping findings are merged under a single
entry with both reviewer IDs noted.

---

### M-01 — HIGH | correctness | Reviewers A+B

**Ectopic filter asymmetry: wrong avoidance rule + delta=0.0 not guaranteed**

`goose_hrv_v0` (metrics.rs line 1114) runs the Lipponen-Tarvainen ectopic beat filter on RR
segments before computing RMSSD/SDNN/pnn50/mean_nn. `reference_hrv_time_domain` applies NO ectopic
filter — only the 300–2000ms range gate. With `rr_timestamps_s: None` and `stage_segments: None`
(as all 6 new HRV fixtures specify), goose still runs the ectopic filter on a single segment.

If any fixture interval is classified as ectopic by goose but retained by reference, both sides
compute on different interval sets. `absolute_delta` will not be 0.0; `assert_close(delta, 0.0)`
with epsilon 1e-9 fails.

The plan's stated safety rule (Task 1 action): "Keep adjacent interval differences ≤200ms to avoid
ectopic filter removal." This criterion does not exist in the codebase. The actual criterion
(metrics.rs line 2657–2701) is Lipponen-Tarvainen median-relative: reject if
`|interval[i] − local_5beat_median| > 0.20 × local_5beat_median`. This is interval-value-dependent:

- Around 800ms → ±160ms window (not ±200ms)
- Around 1330ms (bradycardic) → ±266ms window
- Around 700ms (young) → ±140ms window

An execution agent following the stated 200ms rule literally could construct fixtures that fail for
interval values where 200ms > 20% of the median.

**Recommendation:**
Either (a) specify exact hard-coded RR arrays for all 6 fixtures (removing executor discretion), or
(b) replace the stated rule with the correct criterion: each interval must stay within ±20% of its
local 5-beat median. Also annotate each fixture with a one-line verification that no interval
violates this threshold before asserting zero delta.

---

### M-02 — HIGH | correctness | Reviewers A+B

**20-interval fixtures have zero ectopic-removal buffer; asymmetric failure mode**

`goose_hrv_v0` errors with `"not_enough_valid_rr_intervals"` when `valid.len() < 20` (metrics.rs
line 1077–1079, comment: "my-whoop MIN_BEATS=20"). `reference_hrv_time_domain` errors only when
`valid.len() < 2`. This means:

- A 20-interval fixture where the ectopic filter removes even ONE interval → goose errors (19 < 20),
  reference succeeds (19 ≥ 2).
- `compare_hrv_goose_to_reference` finds `goose.output == None`, `reference.output == Some(...)`,
  pushes `"comparison_outputs_missing"`, returns `report.pass = false`.
- The test fails.

Two fixtures use exactly 20 intervals: `hrv_low_hrv_high_stress_fixture` and
`hrv_bradycardic_resting_fixture`. Both sit on the hard floor with no buffer.

**Recommendation:**
Use a minimum of 25 RR intervals for all fixtures. The plan's stated minimum of 20 is the goose
hard floor, not a safe working minimum. Document: "use ≥25 intervals; the goose MIN_BEATS=20
threshold applies post-ectopic-filter, so fixtures must exceed it by at least 5 to tolerate
edge-case removal."

---

### A-03 — HIGH | correctness | Reviewer A

**sleep_v1_rem_heavy_fixture: WASO field is load-bearing; abbreviated assertion pattern risks executor omission**

For `compare_sleep_v1_goose_to_reference`, `goose_sleep_v1` reads
`input.sleep.wake_after_sleep_onset_minutes` directly from the struct to produce
`goose_output.wake_after_sleep_onset_minutes`. The reference side computes
`(time_in_bed_minutes − sleep_duration_minutes).max(0.0) = 120.0`.

If the executor constructs `SleepV1Input` with `..Default::default()` on the inner `SleepInput`
(leaving `wake_after_sleep_onset_minutes = 0.0`), goose outputs 0.0 while reference outputs 120.0.
`absolute_delta = 120.0`; `assert_close` fails by a wide margin.

The plan correctly states the field must be set explicitly in prose but the abbreviated assertion
pattern in the Task 2 action does not show it, and the language "or a smaller value" permits a
non-matching WASO.

**Recommendation:**
The `SleepV1Input` construction block must show `wake_after_sleep_onset_minutes` set to exactly
`time_in_bed_minutes − sleep_duration_minutes` (i.e., 120.0 for v1_rem_heavy). Remove the phrase
"or a smaller value" — it is dangerous. The rule is: WASO must equal TIB − sleep_duration so that
`goose_output.waso_minutes` matches the reference derivation.

---

### B-01 — HIGH | correctness | Reviewer B

**fragmentation_index_per_hour formula in plan uses TIB; codebase uses sleep_duration_minutes**

The plan description states: `fragmentation_index_per_hour = disturbance_count / (time_in_bed_minutes / 60.0)`.

The actual implementation in `algorithm_compare.rs` (both goose and reference paths) uses
`sleep_duration_minutes` in the denominator, not `time_in_bed_minutes`. Both sides use the same
formula so `absolute_delta = 0.0` and tests pass — but any documentation in the
VALIDATION-ARTIFACT.md that cites expected values from the plan formula will be incorrect:

| Fixture | Plan formula (TIB) | Correct formula (sleep) |
|---|---|---|
| deep_heavy | 1 / (460/60) ≈ 0.1304 | 1 / (450/60) ≈ 0.1333 |
| short_session | 10 / (360/60) ≈ 1.667 | 10 / (300/60) = 2.000 |
| long_session | 3 / (570/60) ≈ 0.316 | 3 / (480/60) = 0.375 |
| v1_rem_heavy | 15 / (480/60) = 1.875 | 15 / (360/60) = 2.500 |

The values diverge materially (up to 33% for short_session).

**Recommendation:**
Correct the formula in the plan and in every section of VALIDATION-ARTIFACT.md that cites expected
fragmentation values: `fragmentation_index_per_hour = disturbance_count / (sleep_duration_minutes / 60.0)`.

---

### M-03 — MEDIUM | correctness | Reviewers A+B

**Sleep v0 WASO field is unused by compare_sleep_goose_to_reference; v1 WASO 'or a smaller value' language is dangerous**

For sleep v0 fixtures, `compare_sleep_goose_to_reference` computes `wake_after_sleep_onset_minutes`
for BOTH goose and reference as `(time_in_bed_minutes − sleep_duration_minutes).max(0.0)`. The
`SleepInput.wake_after_sleep_onset_minutes` field is never read. Any value (including Default=0.0)
is safe for v0 — the plan's instruction to set it explicitly for v0 creates unnecessary confusion.

For v1 fixtures, `goose_sleep_v1` DOES read the field and produces it in output. Reference still
uses TIB-sleep. The plan's phrase "set to `time_in_bed_minutes - sleep_duration_minutes` or a
smaller value" is dangerous — a smaller value would produce delta > 0.0, failing `assert_close`.

**Recommendation:**
Restructure the task action: for v0 fixtures, state explicitly that the WASO field is ignored by
the comparison function (any value is safe). For v1 fixtures, state that
`wake_after_sleep_onset_minutes` must be set to exactly `time_in_bed_minutes − sleep_duration_minutes`.
Remove "or a smaller value."

---

### B-04 — MEDIUM | completeness | Reviewer B

**Pre-existing sleep test baseline may be 2, not 3 — borderline ≥7 count at risk**

The plan states "Sleep: 7 (3 pre-existing + 4 new)." From `algorithm_compare_tests.rs`, the
pre-existing functions that call the direct comparison functions (`compare_sleep_goose_to_reference`
or `compare_sleep_v1_goose_to_reference`) are:

1. `sleep_comparison_reports_shared_window_and_actigraphy_summary_fields` (v0)
2. `sleep_v1_comparison_passes_reference_sleep_wake_summary_fields` (v1)

Two additional functions call `compare_sleep_goose_to_EXTERNAL_reference_report` and
`compare_sleep_v1_goose_to_EXTERNAL_reference_report` — different APIs, comparing against an
externally-provided JSON blob rather than the internal reference algorithm.

If VAL-SLP-04 counts only direct-comparison-function calls, the baseline is 2 and 4 new = 6,
falling short of the ≥7 requirement. The plan does not define which function signatures count.

**Recommendation:**
Add one more sleep fixture test (5 new total) using `compare_sleep_goose_to_reference` to guarantee
≥7 direct-comparison tests regardless of interpretation. Alternatively, clarify in
VALIDATION-ARTIFACT.md which specific function names satisfy VAL-SLP-04 and verify the count
against that definition before signing SC-3 COMPLETE.

---

### A-05 — MEDIUM | testing | Reviewer A

**HRV assertion pattern omits comparable_fields.len() == 4 check**

The plan's Task 1 behavior block mentions "4 zero-delta comparable fields" for the first fixture but
the assertion pattern in the action section does not include
`assert_eq!(report.comparable_fields.len(), 4)`. The existing test
`hrv_comparison_reports_zero_deltas_for_shared_time_domain_fields` asserts this explicitly.

Without the count assertion, a future change to `compare_hrv_goose_to_reference` that silently
drops a comparable field would not be caught by the new tests.

**Recommendation:**
Add `assert_eq!(report.comparable_fields.len(), 4)` to the assertion block of each new HRV test,
matching the pattern of the existing test.

---

### B-06 — MEDIUM | testing | Reviewer B

**comparable_fields.len() == 7 assertion omitted from sleep_v1 fixture pattern**

The plan's Task 2 v0 assertion pattern includes `assert_eq!(report.comparable_fields.len(), 7)`.
The v1 assertion pattern omits it. The existing v1 test at line 98 asserts the full 7-element vec.
A future change narrowing the v1 comparable fields would not be caught by the new v1 fixture.

**Recommendation:**
Add `assert_eq!(report.comparable_fields.len(), 7)` to the `sleep_v1_rem_heavy_fixture` assertion
block.

---

### M-04 — MEDIUM | testing | Reviewers A+B

**Verification grep -c 'fn sleep_' is unreliable — external-reference tests also match the prefix**

The plan's verification command `grep -c "fn sleep_" algorithm_compare_tests.rs` counts ALL
functions prefixed `sleep_`, including the external-reference variants
(`sleep_comparison_accepts_external_reference_report_output`,
`sleep_v1_comparison_accepts_external_reference_report_output`). These do not test the internal
reference algorithm. The grep may pass while the direct-comparison count is below ≥7.

**Recommendation:**
Replace with:
```bash
grep -c 'compare_sleep_goose_to_reference\|compare_sleep_v1_goose_to_reference' \
  Rust/core/tests/algorithm_compare_tests.rs
```
This counts only calls to the target functions (excluding `_external` variants). Expected: ≥7.

---

### A-08 — LOW | testing | Reviewer A

**Plan claims RMSSD ≈113ms for high-HRV fixture but never asserts it**

Task 1 states "RMSSD ≈ 113ms" for `hrv_high_hrv_well_recovered_fixture`. No test asserts this
value. The tests only assert `report.pass` and `absolute_delta == 0.0`. The stated RMSSD is an
undocumented and untested pre-computation; it could silently diverge from actual output.

**Recommendation:**
Either add `assert_close(report.deltas[1].goose_value, 113.0)` with a wider tolerance (e.g., ±5ms)
to document and verify the physiological intent, or remove the approximate claim from the plan to
avoid false precision.

---

### A-09 — LOW | completeness | Reviewer A

**VALIDATION-ARTIFACT.md must be written after cargo test passes, not speculatively**

Task 2 writes the artifact as part of its main body, but the `cargo test --locked` verification
runs after both tasks complete. An executor writing the artifact before the test run may hard-code
"PASS" speculatively. If tests then fail, the artifact contains a false attestation.

**Recommendation:**
Explicitly sequence the artifact write as the final step after verification passes. Add a note:
"The cargo test output section must be populated from actual test runner output, not assumed."

---

### B-08 — LOW | completeness | Reviewer B

**SC-1/SC-2 deferred descriptions too vague for future audit**

The plan specifies SC-1 as "Real overnight RMSSD validation — deferred pending WHOOP 5 device
access" and SC-2 as "Real sleep staging concordance ≥70% — deferred pending WHOOP 5 device access."
These omit: measurable acceptance criteria for SC-1, sample size requirements, and which reference
standard is used for SC-2 concordance.

**Recommendation:**
Each SC entry must include: (1) measurable acceptance criterion (e.g., "mean absolute RMSSD error
≤5ms across ≥7 overnight sessions"), (2) reference standard (PSG / GGIR / WHOOP app), and (3)
minimum session count. Values can be marked "TBD pending device access" but the structure must be
present to be auditable.

---

### A-10 — LOW | clarity | Reviewer A

**start_time/end_time not specified for new HRV fixtures**

Task 1 describes RR interval arrays without specifying `start_time` / `end_time` strings. The
existing passing test uses a 1-minute window with 20 intervals (~16 seconds of RR data) — a
mismatch that the comparison function ignores. For the 60-interval fixture the divergence is larger.
No error results, but VALIDATION-ARTIFACT.md citing implausible windows undermines its audit value.

**Recommendation:**
Specify `start_time` / `end_time` per fixture that are physiologically consistent with the RR count
(e.g., 60 intervals × ~950ms ≈ 57s → end_time = start_time + 60s).

---

### A-11 — INFO | Reviewer A

**cargo test --locked: no new dependencies — will pass**

No new Cargo dependencies are added. The plan adds test functions to an existing integration test
file. `cargo test --locked` does not require Cargo.lock regeneration. No action required.

---

### M-05 — INFO | Reviewers A+B

**Zero delta guarantee is architectural (shared math functions), not numerical tolerance**

`assert_close(delta.absolute_delta, 0.0)` with epsilon 1e-9 works because both `goose_hrv_v0` and
`reference_hrv_time_domain` call the same underlying `rmssd()`, `sample_sd()`, `pnn50()`, `mean()`
functions on identical post-gate interval slices (when no ectopic divergence occurs). The result is
bit-identical, not merely within epsilon. Future maintainers seeing 1e-9 may assume it tolerates
rounding — it does not.

**Recommendation:**
Add a comment before the new HRV test block explaining: "Both algorithms call the same shared Rust
math functions on identical post-gate intervals when no ectopic removal occurs; delta is expected to
be exactly 0.0, not merely within epsilon. A non-zero delta indicates an architectural divergence
(ectopic filter asymmetry or changed formula), not floating-point noise."

---

### B-10 — INFO | Reviewer B

**comparison_fails_... function name does not start with hrv_; HRV count is correct**

The existing failure-mode test `comparison_fails_when_both_algorithms_lack_comparable_outputs`
calls `compare_hrv_goose_to_reference` but does not match `grep 'fn hrv_'`. The plan counts 1
pre-existing HRV passing test (`hrv_comparison_reports_zero_deltas_for_shared_time_domain_fields`),
which is correct. Adding 6 new `hrv_` functions gives exactly 7. No action required — noted for
completeness.

---

## Summary Table

| ID | Severity | Category | Title |
|----|----------|----------|-------|
| M-01 | HIGH | correctness | Ectopic filter asymmetry + wrong avoidance rule |
| M-02 | HIGH | correctness | 20-interval fixtures have zero ectopic-removal buffer |
| A-03 | HIGH | correctness | v1 WASO field is load-bearing; abbreviated pattern risks omission |
| B-01 | HIGH | correctness | fragmentation_index_per_hour formula uses TIB instead of sleep_duration |
| M-03 | MEDIUM | correctness | v0 WASO unused; v1 "or a smaller value" is dangerous |
| B-04 | MEDIUM | completeness | Baseline sleep count may be 2, not 3 — borderline ≥7 at risk |
| A-05 | MEDIUM | testing | HRV assertion pattern omits comparable_fields.len() == 4 |
| B-06 | MEDIUM | testing | sleep_v1 assertion pattern omits comparable_fields.len() == 7 |
| M-04 | MEDIUM | testing | Verification grep for sleep_ overcounts (external-reference functions match) |
| A-08 | LOW | testing | RMSSD ≈113ms claimed but never asserted |
| A-09 | LOW | completeness | VALIDATION-ARTIFACT.md must be written after cargo test passes |
| B-08 | LOW | completeness | SC-1/SC-2 deferred descriptions missing measurable criteria |
| A-10 | LOW | clarity | start_time/end_time unspecified for new HRV fixtures |
| A-11 | INFO | — | cargo test --locked: no new deps, will pass |
| M-05 | INFO | — | Zero delta is architectural, not numerical — should be documented |
| B-10 | INFO | — | HRV count is correct; failure test name does not match grep |

**Total:** 4 HIGH · 5 MEDIUM · 3 LOW · 4 INFO

---

# Phase 123 — Cycle 2 Verification Review

**Plan:** `123-01-PLAN.md`
**Reviewer:** B (Claude adversarial perspective)
**Date:** 2026-06-28
**Cycle:** 2 — Verification of cycle 1 HIGH resolutions
**Verdict:** APPROVED_WITH_NOTE
**HIGH count:** 0 (all 4 cycle 1 HIGHs resolved)

---

## CYCLE_SUMMARY

```
high_count: 0
new_medium_count: 1
verdict: APPROVED_WITH_NOTE
```

---

## M-01 Verification

**Status:** RESOLVED

**Evidence:** The revised plan replaces the incorrect "adjacent interval differences ≤200ms" rule with the correct Lipponen-Tarvainen criterion:

> "goose_hrv_v0 applies the Lipponen-Tarvainen ectopic filter: an interval is rejected if |interval[i] − local_5beat_median| > 0.20 × local_5beat_median. The reference algorithm does NOT apply this filter — if goose removes an interval that reference retains, both sides compute on different sets and absolute_delta ≠ 0.0."
>
> "Safe fixture design: keep all intervals within ±20% of their local 5-beat median. For moderate variance (750–850ms range), this means no single interval should deviate more than ~160ms from the local median."

Each of the 6 per-fixture specifications explicitly verifies safety against the 20% rule with numerical proofs (e.g., "20% of 800ms (~160ms limit)", "20% of 1330ms ≈ 266ms — ±10ms jitter is far within limit").

**Notes:** Thorough fix. Plan explains the asymmetry (goose filters, reference does not) and provides per-fixture numerical safety proofs. No residual concerns.

---

## M-02 Verification

**Status:** RESOLVED

**Evidence:** The plan now mandates ≥30 intervals per fixture with explicit rationale tied to the MIN_BEATS=20 floor:

> "Use ≥ 30 intervals per fixture (M-02 fix). The goose MIN_BEATS=20 threshold applies post-ectopic-filter. Using exactly 20 leaves zero buffer: one removal causes 19 < 20 failure. 30 intervals provides a safe buffer above the hard floor."
>
> "`rr_intervals_ms`: Vec<f64> with ≥ 30 values (per M-02 — 30 provides safe buffer above MIN_BEATS=20 post-filter floor)"

All 6 fixture specifications state "30 intervals" or "60 intervals" — none use 20.

**Notes:** Fully resolved. The 60-interval fixture (hrv_long_window_moderate) provides additional headroom. No residual concerns.

---

## A-03 Verification

**Status:** RESOLVED

**Evidence:** The plan now mandates the exact value and explicitly forbids both the "smaller value" hedge and the Default::default() escape hatch:

> "`sleep.wake_after_sleep_onset_minutes`: set to EXACTLY `time_in_bed_minutes − sleep_duration_minutes` (A-03 fix). For sleep_v1_rem_heavy_fixture: 480.0 − 360.0 = 120.0. Set this value explicitly as a numeric literal — do NOT use Default::default() (leaves 0.0) and do NOT use any smaller value."
>
> "Rationale: goose_sleep_v1 reads this field directly and emits it as goose_output.waso_minutes; the reference computes (TIB − sleep_duration).max(0.0) = 120.0. Any mismatch yields delta=120.0 which fails assert_close."

The concrete field values table confirms: "wake_after_sleep_onset_minutes 120.0 (= time_in_bed − sleep_duration; must be explicit, not Default)".

**Notes:** Both prohibited paths called out by name. Numeric derivation shown inline. No residual concerns.

---

## B-01 Verification

**Status:** RESOLVED

**Evidence:** The plan corrects the fragmentation formula denominator and provides correct expected values:

> "B-01 fix — fragmentation_index_per_hour formula: the denominator is sleep_duration_minutes (NOT time_in_bed_minutes). Both goose and reference use sleep_duration_minutes; delta is 0.0."
>
> "- deep_heavy: 1 / (450.0 / 60.0) ≈ 0.1333 per hour
> - short_session: 10 / (300.0 / 60.0) = 2.0000 per hour
> - long_session: 3 / (480.0 / 60.0) = 0.3750 per hour
> - v1_rem_heavy: 15 / (360.0 / 60.0) = 2.5000 per hour"
>
> "Do NOT cite TIB-based values in the artifact documentation."

The VALIDATION-ARTIFACT.md section specification (section 4) also repeats the corrected formula with the explicit "NOT time_in_bed_minutes" guard.

**Notes:** All four expected values arithmetically correct. Fix applied in both test construction rules and artifact documentation specification. No residual concerns.

---

## New findings introduced by revisions

### NEW-M-01 — MEDIUM | correctness | Reviewer B

**sleep v0 `..Default::default()` may zero a load-bearing WASO field**

The plan instructs the executor to use `..Default::default()` for all remaining optional fields in the three sleep v0 fixtures. If `SleepInput.wake_after_sleep_onset_minutes` is included in the v0 `comparable_fields` (the plan asserts `comparable_fields.len() == 7` but does not enumerate the 7 fields), Default yields 0.0 while the reference computes `(TIB − sleep_duration).max(0.0)`:

| Fixture | TIB | sleep | Reference WASO | Default WASO | Delta |
|---------|-----|-------|----------------|--------------|-------|
| deep_heavy | 460 | 450 | 10.0 | 0.0 | 10.0 |
| short_session | 360 | 300 | 60.0 | 0.0 | 60.0 |
| long_session | 570 | 480 | 90.0 | 0.0 | 90.0 |

If WASO is among the 7 v0 fields, all three v0 fixtures would fail assert_close.

**Recommendation:** Enumerate the 7 v0 comparable fields explicitly, or add a note confirming `wake_after_sleep_onset_minutes` is not among them for v0. If it is, apply the same explicit-value fix as A-03 to all three v0 fixtures. (The executor can resolve this by inspecting the existing v0 test at lines 57–95 of algorithm_compare_tests.rs.)

**Blocking?** No — this is conditional on field membership in the v0 comparable set and does not block execution; the executor has a clear resolution path via inspection of the existing test.
