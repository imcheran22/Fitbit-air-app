package com.apex.athlete.core.domain

/** Grouping used for navigation and for choosing which source wins a conflict. */
enum class MetricCategory {
    CARDIOVASCULAR,
    RESPIRATORY,
    TEMPERATURE,
    SLEEP,
    ACTIVITY,
    BODY,
    EXTERNAL_HEALTH,
    SUBJECTIVE,
    SCORE,
    TRAINING_LOAD,
}

/** Whether a higher reading is generally the favourable direction for the user. */
enum class Polarity { HIGHER_IS_BETTER, LOWER_IS_BETTER, NEUTRAL }

/**
 * Every metric the app stores or computes.
 *
 * The same type is used in two tables: `daily_biometric_summary` holds one value per civil day
 * (for example the nightly average HRV), and `metric_sample` holds the raw timestamped samples
 * of the same quantity (for example the 5-minute HRV readings during sleep).
 *
 * [storageKey] is persisted; never rename an existing key.
 */
enum class MetricType(
    val storageKey: String,
    val category: MetricCategory,
    val unit: String,
    val polarity: Polarity = Polarity.NEUTRAL,
    /** True for values produced by the analytics engine rather than read from a source. */
    val isDerived: Boolean = false,
) {
    // --- Cardiovascular -------------------------------------------------------------------
    RESTING_HEART_RATE("rhr", MetricCategory.CARDIOVASCULAR, "bpm", Polarity.LOWER_IS_BETTER),
    HRV_RMSSD("hrv_rmssd", MetricCategory.CARDIOVASCULAR, "ms", Polarity.HIGHER_IS_BETTER),
    HRV_DEEP_SLEEP_RMSSD("hrv_deep_rmssd", MetricCategory.CARDIOVASCULAR, "ms", Polarity.HIGHER_IS_BETTER),
    /**
     * Mean RMSSD of the Google `heart-rate-variability` samples that fall inside the night's non-awake
     * sleep stages (one value per night). Deliberately separate from [HRV_RMSSD], which is the vendor's
     * nightly figure; the two are never mixed into one baseline.
     */
    HRV_SLEEP_SAMPLES("hrv_sleep_samples", MetricCategory.CARDIOVASCULAR, "ms", Polarity.HIGHER_IS_BETTER),
    SLEEPING_HEART_RATE("sleeping_hr", MetricCategory.CARDIOVASCULAR, "bpm", Polarity.LOWER_IS_BETTER),
    HEART_RATE_AVG("hr_avg", MetricCategory.CARDIOVASCULAR, "bpm"),
    HEART_RATE_MIN("hr_min", MetricCategory.CARDIOVASCULAR, "bpm"),
    HEART_RATE_MAX("hr_max", MetricCategory.CARDIOVASCULAR, "bpm"),
    VO2_MAX("vo2_max", MetricCategory.CARDIOVASCULAR, "ml/kg/min", Polarity.HIGHER_IS_BETTER),

    /**
     * Frequency-domain HRV of one five-minute window during sleep (Takeout "Heart Rate Variability
     * Details" `low_frequency` / `high_frequency`). Stored as raw samples only; the unit is
     * UNVERIFIED (reported as ms²) and no score uses them yet.
     */
    HRV_LOW_FREQUENCY("hrv_lf", MetricCategory.CARDIOVASCULAR, "ms²"),
    HRV_HIGH_FREQUENCY("hrv_hf", MetricCategory.CARDIOVASCULAR, "ms²"),

    // --- Respiratory ----------------------------------------------------------------------
    SPO2_AVG("spo2_avg", MetricCategory.RESPIRATORY, "%", Polarity.HIGHER_IS_BETTER),
    SPO2_LOWER_BOUND("spo2_low", MetricCategory.RESPIRATORY, "%", Polarity.HIGHER_IS_BETTER),
    SPO2_UPPER_BOUND("spo2_high", MetricCategory.RESPIRATORY, "%"),
    RESPIRATORY_RATE("resp_rate", MetricCategory.RESPIRATORY, "brpm"),

    // --- Temperature ----------------------------------------------------------------------
    /** Nightly skin temperature minus the personal baseline, in °C. */
    SKIN_TEMP_DEVIATION("skin_temp_dev", MetricCategory.TEMPERATURE, "°C"),
    SKIN_TEMP_NIGHTLY("skin_temp_night", MetricCategory.TEMPERATURE, "°C"),

    // --- Sleep (values of the main sleep that ended on the day) ---------------------------
    SLEEP_DURATION("sleep_min", MetricCategory.SLEEP, "min", Polarity.HIGHER_IS_BETTER),
    TIME_IN_BED("in_bed_min", MetricCategory.SLEEP, "min"),
    SLEEP_EFFICIENCY("sleep_eff", MetricCategory.SLEEP, "%", Polarity.HIGHER_IS_BETTER),
    SLEEP_DEEP("sleep_deep_min", MetricCategory.SLEEP, "min", Polarity.HIGHER_IS_BETTER),
    SLEEP_REM("sleep_rem_min", MetricCategory.SLEEP, "min", Polarity.HIGHER_IS_BETTER),
    SLEEP_LIGHT("sleep_light_min", MetricCategory.SLEEP, "min"),
    SLEEP_AWAKE("sleep_awake_min", MetricCategory.SLEEP, "min", Polarity.LOWER_IS_BETTER),
    SLEEP_LATENCY("sleep_latency_min", MetricCategory.SLEEP, "min", Polarity.LOWER_IS_BETTER),

    // --- Activity -------------------------------------------------------------------------
    STEPS("steps", MetricCategory.ACTIVITY, "steps", Polarity.HIGHER_IS_BETTER),
    DISTANCE("distance_m", MetricCategory.ACTIVITY, "m", Polarity.HIGHER_IS_BETTER),
    FLOORS("floors", MetricCategory.ACTIVITY, "floors", Polarity.HIGHER_IS_BETTER),
    CALORIES_TOTAL("kcal_total", MetricCategory.ACTIVITY, "kcal"),
    CALORIES_ACTIVE("kcal_active", MetricCategory.ACTIVITY, "kcal"),
    ACTIVE_ZONE_MINUTES("azm", MetricCategory.ACTIVITY, "min", Polarity.HIGHER_IS_BETTER),
    SEDENTARY_MINUTES("sedentary_min", MetricCategory.ACTIVITY, "min", Polarity.LOWER_IS_BETTER),
    LIGHTLY_ACTIVE_MINUTES("light_active_min", MetricCategory.ACTIVITY, "min"),
    MODERATELY_ACTIVE_MINUTES("moderate_active_min", MetricCategory.ACTIVITY, "min"),
    VERY_ACTIVE_MINUTES("very_active_min", MetricCategory.ACTIVITY, "min"),

    // --- Body -----------------------------------------------------------------------------
    WEIGHT("weight_kg", MetricCategory.BODY, "kg"),
    BODY_FAT("body_fat_pct", MetricCategory.BODY, "%"),
    BMI("bmi", MetricCategory.BODY, "kg/m²", isDerived = true),

    // --- Measurements that only exist if the user has another authorised device/app -------
    BLOOD_PRESSURE_SYSTOLIC("bp_sys", MetricCategory.EXTERNAL_HEALTH, "mmHg"),
    BLOOD_PRESSURE_DIASTOLIC("bp_dia", MetricCategory.EXTERNAL_HEALTH, "mmHg"),
    BLOOD_GLUCOSE("glucose_mmol", MetricCategory.EXTERNAL_HEALTH, "mmol/L"),
    HYDRATION("hydration_ml", MetricCategory.EXTERNAL_HEALTH, "mL"),
    NUTRITION_ENERGY("nutrition_kcal", MetricCategory.EXTERNAL_HEALTH, "kcal"),

    // --- Subjective (typed in by the user) ------------------------------------------------
    /** 1 = completely fresh, 10 = exhausted. */
    SUBJECTIVE_FATIGUE("subj_fatigue", MetricCategory.SUBJECTIVE, "1-10", Polarity.LOWER_IS_BETTER),
    /** 1 = no soreness, 10 = severe. */
    SUBJECTIVE_SORENESS("subj_soreness", MetricCategory.SUBJECTIVE, "1-10", Polarity.LOWER_IS_BETTER),

    // --- Journal factors (typed in by the user; one yes/no per day, 1.0 = yes, 0.0 = no, no row = not logged) --
    JOURNAL_ALCOHOL("journal_alcohol", MetricCategory.SUBJECTIVE, "yes/no"),
    JOURNAL_LATE_CAFFEINE("journal_late_caffeine", MetricCategory.SUBJECTIVE, "yes/no"),
    JOURNAL_LATE_MEAL("journal_late_meal", MetricCategory.SUBJECTIVE, "yes/no"),
    JOURNAL_STRESSFUL_DAY("journal_stressful_day", MetricCategory.SUBJECTIVE, "yes/no"),
    JOURNAL_TRAVEL("journal_travel", MetricCategory.SUBJECTIVE, "yes/no"),

    // --- Scores computed by the analytics engine ------------------------------------------
    RECOVERY_SCORE("recovery_score", MetricCategory.SCORE, "%", Polarity.HIGHER_IS_BETTER, isDerived = true),
    STRAIN_SCORE("strain_score", MetricCategory.SCORE, "0-21", isDerived = true),
    STRAIN_TARGET("strain_target", MetricCategory.SCORE, "0-21", isDerived = true),
    SLEEP_SCORE("sleep_score", MetricCategory.SCORE, "%", Polarity.HIGHER_IS_BETTER, isDerived = true),
    SLEEP_NEED("sleep_need_min", MetricCategory.SCORE, "min", isDerived = true),
    SLEEP_DEBT("sleep_debt_min", MetricCategory.SCORE, "min", Polarity.LOWER_IS_BETTER, isDerived = true),
    SLEEP_CONSISTENCY("sleep_consistency", MetricCategory.SCORE, "%", Polarity.HIGHER_IS_BETTER, isDerived = true),

    // --- Added in formula version 4 (stored as text keys, so no Room schema change) ---------------------------------
    /** Resting daytime heart rate of the day: P10 of the waking-hour still-minute means (StressEngine). Feeds the stress baseline. */
    STRESS_DAY_AGGREGATE_BPM("stress_day_bpm", MetricCategory.SCORE, "bpm", Polarity.LOWER_IS_BETTER, isDerived = true),
    /** Mean of the per-minute 0..3 stress levels of the day. Heart rate while still; not a psychological measure. */
    STRESS_SCORE("stress_score", MetricCategory.SCORE, "0-3", Polarity.LOWER_IS_BETTER, isDerived = true),
    STRESS_LOW_MINUTES("stress_low_min", MetricCategory.SCORE, "min", Polarity.HIGHER_IS_BETTER, isDerived = true),
    STRESS_MEDIUM_MINUTES("stress_medium_min", MetricCategory.SCORE, "min", isDerived = true),
    STRESS_HIGH_MINUTES("stress_high_min", MetricCategory.SCORE, "min", Polarity.LOWER_IS_BETTER, isDerived = true),
    /** Sleeping heart-rate dip: 100 x (daytime mean - sleeping mean) / daytime mean, signed (negative = sleeping HR higher). */
    HR_DIP("hr_dip_pct", MetricCategory.SCORE, "%", isDerived = true),

    // --- Training load computed by the analytics engine -----------------------------------
    DAILY_TRIMP("trimp", MetricCategory.TRAINING_LOAD, "TRIMP", isDerived = true),
    ACUTE_LOAD("atl", MetricCategory.TRAINING_LOAD, "TRIMP/day", isDerived = true),
    CHRONIC_LOAD("ctl", MetricCategory.TRAINING_LOAD, "TRIMP/day", isDerived = true),
    ACWR_COUPLED("acwr_coupled", MetricCategory.TRAINING_LOAD, "ratio", isDerived = true),
    ACWR_UNCOUPLED("acwr_uncoupled", MetricCategory.TRAINING_LOAD, "ratio", isDerived = true),
    TRAINING_MONOTONY("monotony", MetricCategory.TRAINING_LOAD, "ratio", isDerived = true),
    TRAINING_STRAIN_FOSTER("foster_strain", MetricCategory.TRAINING_LOAD, "AU", isDerived = true),
    TRAINING_BALANCE("training_balance", MetricCategory.TRAINING_LOAD, "TRIMP/day", isDerived = true),

    // --- Added in formula version 6 (research metrics, docs/RESEARCH_GAP_MATRIX.md; text keys, no schema change) ---
    // Robust (median/MAD) deviations from the personal baseline. Descriptive only: they never feed a score.
    /** Robust z of the resting heart rate against its median/MAD baseline. */
    RHR_ROBUST_Z("rhr_rz", MetricCategory.SCORE, "z", isDerived = true),
    /** Robust z of ln RMSSD against its median/MAD baseline (ln scale). */
    HRV_ROBUST_Z("hrv_rz", MetricCategory.SCORE, "z", isDerived = true),
    RESP_RATE_ROBUST_Z("rr_rz", MetricCategory.SCORE, "z", isDerived = true),
    /** Coefficient of variation of ln RMSSD over the last 7 nights, in percent. */
    HRV_CV7_LN("hrv_cv7", MetricCategory.CARDIOVASCULAR, "%", Polarity.LOWER_IS_BETTER, isDerived = true),
    /** Sleep Regularity Index, raw -100..100 (SLEEP_CONSISTENCY stores the clipped sub-score). */
    SLEEP_REGULARITY_INDEX("sri", MetricCategory.SLEEP, "SRI", Polarity.HIGHER_IS_BETTER, isDerived = true),
    /** Midpoint of the main sleep as local minutes after midnight (0..1439). */
    SLEEP_MIDPOINT("sleep_mid", MetricCategory.SLEEP, "min", isDerived = true),
    /** Sample SD of the sleep midpoint over the last 7 nights, minutes. */
    SLEEP_MIDPOINT_SD_7D("sleep_mid_sd7", MetricCategory.SLEEP, "min", Polarity.LOWER_IS_BETTER, isDerived = true),
    /** Sum over the last 7 nights of max(0, 7 h - sleep); estimated shortfall against the guideline, not "debt". */
    GUIDELINE_SHORTFALL_CLIPPED_7D("gsf_c7", MetricCategory.SLEEP, "min", Polarity.LOWER_IS_BETTER, isDerived = true),
    /** Sum over the last 7 nights of (7 h - sleep); negative = surplus. */
    GUIDELINE_SHORTFALL_SIGNED_7D("gsf_s7", MetricCategory.SLEEP, "min", Polarity.LOWER_IS_BETTER, isDerived = true),
    /** Minutes awake inside the main sleep, from the scored stages; absent without stage data. */
    SLEEP_WASO("waso", MetricCategory.SLEEP, "min", Polarity.LOWER_IS_BETTER, isDerived = true),
    AWAKENINGS_PER_HOUR("awak_h", MetricCategory.SLEEP, "1/h", Polarity.LOWER_IS_BETTER, isDerived = true),
    /** Weight (0..1) of the sleep-score parts that were available; below 1 the stored score is partial. */
    SLEEP_SCORE_CONFIDENCE("sleep_conf", MetricCategory.SLEEP, "0-1", isDerived = true),
    /** Sedentary stretches of at least 30 minutes while awake, from minute steps. */
    SEDENTARY_PROLONGED_BOUTS("sed_bouts", MetricCategory.ACTIVITY, "count", Polarity.LOWER_IS_BETTER, isDerived = true),
    SEDENTARY_LONGEST_BOUT("sed_longest", MetricCategory.ACTIVITY, "min", Polarity.LOWER_IS_BETTER, isDerived = true),
    SEDENTARY_BREAKS_PER_HOUR("sed_breaks_h", MetricCategory.ACTIVITY, "1/h", Polarity.HIGHER_IS_BETTER, isDerived = true),
    /** Mean steps per minute of the 30 busiest minutes of the day. */
    PEAK_CADENCE_30("peak_cad30", MetricCategory.ACTIVITY, "steps/min", Polarity.HIGHER_IS_BETTER, isDerived = true),
    ;

    companion object {
        private val byKey = entries.associateBy { it.storageKey }

        fun fromStorageKey(key: String): MetricType =
            byKey[key] ?: throw IllegalArgumentException("Unknown metric key: $key")
    }
}
