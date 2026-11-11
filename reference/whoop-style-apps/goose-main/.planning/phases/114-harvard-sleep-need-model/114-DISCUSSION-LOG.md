# Phase 114: Harvard Sleep Need Model — Discussion Log

**Date:** 2026-06-22
**Mode:** Interactive (gsd-autonomous --interactive)

## Areas Discussed

### 1. Bridge Data Ownership

**Question:** Does `sleep.compute_need` query SQLite for 5-night sleep history itself, or does Swift pre-fetch and pass the array?

**Options presented:**
- Self-querying: bridge args `{database_path, age_years, prior_strain}`, bridge fetches last 5 nights internally
- Caller passes history: args include `sleep_durations_minutes` array, Swift fetches and passes

**Decision:** Self-querying (recommended option selected)

**Notes:** Matches existing bridge pattern where methods are self-contained. Simpler Swift call site.

---

### 2. SleepNeedResult Shape

**Question:** Expose just `total_need_minutes`, or also breakdown fields now?

**Options presented:**
- Full breakdown: `base_need_minutes + debt_adjustment_minutes + strain_adjustment_minutes + total_need_minutes`
- total_need_minutes only: simpler; Phase 120 would need another Rust change

**Decision:** Full breakdown now (recommended option selected)

**Notes:** Phase 120 UI needs components to show optional breakdown. No extra cost to include them now.

---

### 3. age_years Cold-Start

**Question:** When `age_years` is None, which baseline to use?

**Options presented:**
- 26-64 bracket (450 min / 7.5h): statistically common adult bracket, visible change from current 480
- Keep 480 min as None fallback: zero regression
- Claude decides

**Decision:** 26-64 bracket (450 min / 7.5h) — deliberate visible change, more accurate

---

## Claude's Discretion Items

- `perf_budget.rs:677` 480.0 — keep as literal (budget test, not algorithm logic)
- EWMA cold-start: debt_adjustment = 0.0 if no history, EWMA over however many nights exist
- Sleep history source: last 5 completed sleep sessions from SQLite by captured_at DESC

## Deferred

- Swift UI wiring (Phase 120)
- User age settings screen (Phase 120 or later)
- HealthKit date-of-birth auto-fill (future)
