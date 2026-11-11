use crate::GooseResult;
/// Harvard Sleep Need Model — age-bracket baseline + EWMA-debt + strain adjustment.
///
/// # Algorithm
/// 1. Age-bracket baseline: 18-25 → 480 min, 26-64/None → 450 min, 65+ → 420 min.
/// 2. EWMA sleep debt: fold last ≤5 completed sleep sessions (≥60 min) into
///    `EwmaState`; debt = max(0, base_need − ewma_mean). Cold-start → 0.0.
/// 3. Strain adjustment: prior_strain ≥15 → +15 min, ≥10 → +6 min, else 0.
///
/// # History ordering contract
/// The `history` slice passed to `compute_sleep_need` MUST be sorted oldest-first
/// (chronological ascending). `EwmaState::fold` weights the last element most
/// heavily, so incorrect ordering would bias the mean toward stale nights.
use crate::baselines::EwmaState;
use crate::store::GooseStore;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/// Full breakdown of the computed sleep need for one night.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SleepNeedResult {
    /// Baseline sleep need in minutes derived from the age bracket.
    pub base_need_minutes: f64,
    /// Additional minutes needed to repay accumulated sleep debt (EWMA-based; ≥0).
    pub debt_adjustment_minutes: f64,
    /// Additional minutes from prior-day strain adjustment.
    pub strain_adjustment_minutes: f64,
    /// Sum of all three components.
    pub total_need_minutes: f64,
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/// Pure algorithm entry point — no I/O.
///
/// * `age_years`    — user's age; `None` falls back to the 26-64 bracket (450 min).
/// * `history`      — sleep durations in minutes, oldest-first (≥60 min each after filtering).
/// * `prior_strain` — WHOOP strain score for the previous day; `None` or NaN → no adjustment.
pub fn compute_sleep_need(
    age_years: Option<u8>,
    history: &[f64],
    prior_strain: Option<f64>,
) -> SleepNeedResult {
    let base = age_bracket_baseline(age_years);
    let debt = ewma_debt(history, base);
    let strain = strain_adjustment(prior_strain);
    SleepNeedResult {
        base_need_minutes: base,
        debt_adjustment_minutes: debt,
        strain_adjustment_minutes: strain,
        total_need_minutes: base + debt + strain,
    }
}

/// Store-backed wrapper — self-queries the last 5 non-nap sleep sessions from SQLite.
pub fn compute_sleep_need_with_store(
    store: &GooseStore,
    age_years: Option<u8>,
    prior_strain: Option<f64>,
) -> GooseResult<SleepNeedResult> {
    let history = last_5_sleep_durations(store)?;
    Ok(compute_sleep_need(age_years, &history, prior_strain))
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn age_bracket_baseline(age_years: Option<u8>) -> f64 {
    match age_years {
        Some(a) if a <= 25 => 480.0, // 18-25: 8h
        Some(a) if a >= 65 => 420.0, // 65+: 7h
        _ => 450.0,                  // 26-64 and None: 7.5h (D-03)
    }
}

fn ewma_debt(history: &[f64], base_need: f64) -> f64 {
    if history.is_empty() {
        return 0.0;
    }
    let mut state = EwmaState::default();
    for &d in history {
        state.fold(d);
    }
    // Clamp to non-negative: adequate sleep yields zero debt, never negative.
    (base_need - state.mean).max(0.0)
}

fn strain_adjustment(prior_strain: Option<f64>) -> f64 {
    // NaN comparisons evaluate false, so NaN falls through to 0.0 (T-114-02 mitigation).
    match prior_strain {
        Some(s) if s >= 15.0 => 15.0, // +0.25h
        Some(s) if s >= 10.0 => 6.0,  // +0.1h
        _ => 0.0,
    }
}

/// Fetches all external sleep sessions, sorts chronologically, applies the 60-minute
/// nap guard, and returns the last (most recent) ≤5 durations in oldest-first order.
fn last_5_sleep_durations(store: &GooseStore) -> GooseResult<Vec<f64>> {
    let mut sessions = store.external_sleep_sessions_between(0, i64::MAX)?;
    // Sort ascending by end time (oldest first).
    sessions.sort_by_key(|s| s.end_time_unix_ms);
    // Convert to minutes; exclude naps (< 60 min) — mirrors threshold used by
    // external_sleep_history_nights_for_sleep_v1 (T-114-01 mitigation for corrupted rows).
    let durations: Vec<f64> = sessions
        .iter()
        .map(|s| s.duration_ms as f64 / 60_000.0)
        .filter(|&m| m >= 60.0)
        .collect();
    // Keep only the most recent 5, preserving chronological (oldest-first) order.
    let start = durations.len().saturating_sub(5);
    Ok(durations[start..].to_vec())
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- Cold start ---

    #[test]
    fn cold_start_no_history_zero_debt() {
        let result = compute_sleep_need(None, &[], None);
        assert_eq!(result.base_need_minutes, 450.0);
        assert_eq!(result.debt_adjustment_minutes, 0.0);
        assert_eq!(result.strain_adjustment_minutes, 0.0);
        assert_eq!(result.total_need_minutes, 450.0);
    }

    // --- Age brackets ---

    #[test]
    fn age_bracket_18_25_returns_480() {
        let result = compute_sleep_need(Some(22), &[], None);
        assert_eq!(result.base_need_minutes, 480.0);
    }

    #[test]
    fn age_bracket_none_returns_450() {
        let result = compute_sleep_need(None, &[], None);
        assert_eq!(result.base_need_minutes, 450.0);
    }

    #[test]
    fn age_bracket_65_plus_returns_420() {
        let result = compute_sleep_need(Some(70), &[], None);
        assert_eq!(result.base_need_minutes, 420.0);
    }

    #[test]
    fn age_25_in_young_bracket() {
        let result = compute_sleep_need(Some(25), &[], None);
        assert_eq!(result.base_need_minutes, 480.0);
    }

    #[test]
    fn age_26_in_mid_bracket() {
        let result = compute_sleep_need(Some(26), &[], None);
        assert_eq!(result.base_need_minutes, 450.0);
    }

    #[test]
    fn age_65_in_old_bracket() {
        let result = compute_sleep_need(Some(65), &[], None);
        assert_eq!(result.base_need_minutes, 420.0);
    }

    // --- Strain adjustments ---

    #[test]
    fn strain_above_15_adds_15_minutes() {
        let result = compute_sleep_need(None, &[], Some(16.0));
        assert_eq!(result.strain_adjustment_minutes, 15.0);
    }

    #[test]
    fn strain_at_15_inclusive_adds_15_minutes() {
        let result = compute_sleep_need(None, &[], Some(15.0));
        assert_eq!(result.strain_adjustment_minutes, 15.0);
    }

    #[test]
    fn strain_above_10_adds_6_minutes() {
        let result = compute_sleep_need(None, &[], Some(12.0));
        assert_eq!(result.strain_adjustment_minutes, 6.0);
    }

    #[test]
    fn strain_at_10_inclusive_adds_6_minutes() {
        let result = compute_sleep_need(None, &[], Some(10.0));
        assert_eq!(result.strain_adjustment_minutes, 6.0);
    }

    #[test]
    fn strain_below_10_adds_0_minutes() {
        let result = compute_sleep_need(None, &[], Some(9.9));
        assert_eq!(result.strain_adjustment_minutes, 0.0);
    }

    #[test]
    fn strain_nan_adds_0_minutes() {
        let result = compute_sleep_need(None, &[], Some(f64::NAN));
        assert_eq!(result.strain_adjustment_minutes, 0.0);
    }

    // --- EWMA debt ---

    #[test]
    fn ewma_debt_positive_when_undersleeping() {
        // 6h/night consistently below 450 min base for None age
        let history = vec![360.0; 5];
        let result = compute_sleep_need(None, &history, None);
        assert!(
            result.debt_adjustment_minutes > 0.0,
            "expected positive debt, got {}",
            result.debt_adjustment_minutes
        );
    }

    #[test]
    fn ewma_debt_zero_when_adequate() {
        // Sleeping at or above base need — debt clamped to 0
        let history = vec![450.0, 460.0, 455.0, 470.0, 450.0];
        let result = compute_sleep_need(None, &history, None);
        assert_eq!(
            result.debt_adjustment_minutes, 0.0,
            "expected zero debt for adequate sleep, got {}",
            result.debt_adjustment_minutes
        );
    }

    // --- Total is sum ---

    #[test]
    fn total_need_is_sum_of_components() {
        let history = vec![360.0; 3];
        let result = compute_sleep_need(Some(22), &history, Some(12.0));
        let expected = result.base_need_minutes
            + result.debt_adjustment_minutes
            + result.strain_adjustment_minutes;
        assert!(
            (result.total_need_minutes - expected).abs() < 1e-9,
            "total {} != sum {}",
            result.total_need_minutes,
            expected
        );
    }

    // --- Store-backed cold start ---

    #[test]
    fn cold_start_with_store_empty_db_returns_base_only() {
        let store = GooseStore::open_in_memory().expect("open in-memory store");
        let result = compute_sleep_need_with_store(&store, None, None)
            .expect("compute_sleep_need_with_store failed");
        assert_eq!(result.base_need_minutes, 450.0);
        assert_eq!(result.debt_adjustment_minutes, 0.0);
        assert_eq!(result.total_need_minutes, 450.0);
    }
}
