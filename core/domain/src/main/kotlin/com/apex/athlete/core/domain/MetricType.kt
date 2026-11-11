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
    SLEEPING_HEART_RATE("sleeping_hr", MetricCategory.CARDIOVASCULAR, "bpm", Polarity.LOWER_IS_BETTER),
    HEART_RATE_AVG("hr_avg", MetricCategory.CARDIOVASCULAR, "bpm"),
    HEART_RATE_MIN("hr_min", MetricCategory.CARDIOVASCULAR, "bpm"),
    HEART_RATE_MAX("hr_max", MetricCategory.CARDIOVASCULAR, "bpm"),
    VO2_MAX("vo2_max", MetricCategory.CARDIOVASCULAR, "ml/kg/min", Polarity.HIGHER_IS_BETTER),

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

    // --- Scores computed by the analytics engine ------------------------------------------
    RECOVERY_SCORE("recovery_score", MetricCategory.SCORE, "%", Polarity.HIGHER_IS_BETTER, isDerived = true),
    STRAIN_SCORE("strain_score", MetricCategory.SCORE, "0-21", isDerived = true),
    STRAIN_TARGET("strain_target", MetricCategory.SCORE, "0-21", isDerived = true),
    SLEEP_SCORE("sleep_score", MetricCategory.SCORE, "%", Polarity.HIGHER_IS_BETTER, isDerived = true),
    SLEEP_NEED("sleep_need_min", MetricCategory.SCORE, "min", isDerived = true),
    SLEEP_DEBT("sleep_debt_min", MetricCategory.SCORE, "min", Polarity.LOWER_IS_BETTER, isDerived = true),
    SLEEP_CONSISTENCY("sleep_consistency", MetricCategory.SCORE, "%", Polarity.HIGHER_IS_BETTER, isDerived = true),

    // --- Training load computed by the analytics engine -----------------------------------
    DAILY_TRIMP("trimp", MetricCategory.TRAINING_LOAD, "TRIMP", isDerived = true),
    ACUTE_LOAD("atl", MetricCategory.TRAINING_LOAD, "TRIMP/day", isDerived = true),
    CHRONIC_LOAD("ctl", MetricCategory.TRAINING_LOAD, "TRIMP/day", isDerived = true),
    ACWR_COUPLED("acwr_coupled", MetricCategory.TRAINING_LOAD, "ratio", isDerived = true),
    ACWR_UNCOUPLED("acwr_uncoupled", MetricCategory.TRAINING_LOAD, "ratio", isDerived = true),
    TRAINING_MONOTONY("monotony", MetricCategory.TRAINING_LOAD, "ratio", isDerived = true),
    TRAINING_STRAIN_FOSTER("foster_strain", MetricCategory.TRAINING_LOAD, "AU", isDerived = true),
    TRAINING_BALANCE("training_balance", MetricCategory.TRAINING_LOAD, "TRIMP/day", isDerived = true),
    ;

    companion object {
        private val byKey = entries.associateBy { it.storageKey }

        fun fromStorageKey(key: String): MetricType =
            byKey[key] ?: throw IllegalArgumentException("Unknown metric key: $key")
    }
}
