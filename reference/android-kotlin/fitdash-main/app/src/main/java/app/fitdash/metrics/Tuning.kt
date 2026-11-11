package app.fitdash.metrics

object Tuning {
    const val BASELINE_DAYS = 30L
    const val HISTORY_DAYS = 180L
    const val MIN_NIGHTS = 7
    const val MIN_BEDTIME_NIGHTS = 3

    const val WEIGHT_HRV = 0.4
    const val WEIGHT_RHR = 0.3
    const val WEIGHT_SLEEP = 0.3

    const val AT_BASELINE = 70.0
    const val FLOOR = 30.0
    const val HRV_PCT_SPAN = 15.0
    const val RHR_BPM_SPAN = 5.0

    const val SLEEP_TARGET_HOURS = 8.0
    const val MIN_NIGHT_HOURS = 3.0
    const val SLEEP_W_DURATION = 50.0
    const val SLEEP_W_EFFICIENCY = 15.0
    const val SLEEP_W_RESTORATION = 20.0
    const val SLEEP_W_RESTFULNESS = 15.0

    const val BAND_STEADY = 40
    const val BAND_PRIMED = 70

    const val STEP_GOAL = 9000
    const val EVENING_HOUR = 16
    const val TREND_DAYS = 14L
    const val MIN_RANGE_VALUES = 5
    const val WEEK_DAYS = 7L
    const val SUGGEST_MIN_SLEEP_HOURS = 7.0
    const val SUGGEST_HRV_DROP = 0.10
    const val ACTIVE_MINUTES_GOAL = 30
    const val WALK_15_MIN_STEPS = 2000
    const val RHR_WINDOW_MINUTES = 30L
    const val MIN_WINDOW_SAMPLES = 3
    const val MIN_HR_SAMPLES = 30

    const val MIN_WORKOUT_MINUTES = 2L
    const val MIN_WORKOUT_HR_SAMPLES = 5
    const val HR_BUCKET_MINUTES = 5
    const val HR_GAP_BUCKETS = 6
    const val MIN_HR_DAY_SAMPLES = 10
    const val RELOAD_SECONDS = 120L
    const val FULL_READ_HOURS = 24L
    const val REREAD_DAYS = 2L
    const val SYNC_STALE_HOURS = 3L
}
