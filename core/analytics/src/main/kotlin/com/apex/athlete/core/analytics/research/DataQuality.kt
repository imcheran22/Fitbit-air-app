package com.apex.athlete.core.analytics.research

/** How much of a civil day the device actually observed. */
enum class DayCompleteness {
    /** No data at all. The day's metrics are missing, not zero. */
    MISSING,
    /** Some data, but less wear time than a valid day needs. Shown with a caveat, kept out of baselines. */
    PARTIAL,
    COMPLETE,
}

/** Received against expected samples. */
data class Coverage(val validCount: Int, val expectedCount: Int) {
    /** Share of the expected samples that arrived, limited to 0..1. */
    val fraction: Double get() = (validCount.toDouble() / expectedCount).coerceIn(0.0, 1.0)
}

/** Values that passed a range check, and how many did not. */
data class PlausibilityResult(val valid: List<Double>, val rejected: Int)

/**
 * Categorical confidence in one metric on one day. Deliberately not a percentage: a hand-built
 * rule cannot produce a calibrated probability, and showing "87 % confidence" would claim one.
 */
enum class ConfidenceLevel { HIGH, MODERATE, LOW }

enum class ConfidenceReason {
    NO_CURRENT_READING,
    STALE_DATA,
    BASELINE_NOT_ESTABLISHED,
    BASELINE_PROVISIONAL,
    SPARSE_COVERAGE,
    PARTIAL_COVERAGE,
    IMPLAUSIBLE_VALUES,
    KNOWN_CONFOUNDER,
}

/**
 * What the confidence rule looks at.
 *
 * @property baselineValidDays valid days behind the personal baseline.
 * @property coverageFraction share of expected samples received for the reading, or null when
 *   coverage does not apply (a provider daily summary).
 * @property hoursSinceLastSync age of the newest successful sync; null when unknown, which is
 *   treated as stale.
 * @property implausibleValues true when a range check rejected the reading or most of its samples.
 * @property confounders number of user tags that plausibly explain a deviation (alcohol,
 *   illness, travel) for the evaluated day.
 */
data class ConfidenceInputs(
    val hasCurrentReading: Boolean,
    val baselineValidDays: Int,
    val coverageFraction: Double? = null,
    val hoursSinceLastSync: Double? = null,
    val implausibleValues: Boolean = false,
    val confounders: Int = 0,
)

/**
 * @property alertAllowed false at LOW confidence: the value may still be displayed with its
 *   caveats, but no insight or notification is built on it.
 */
data class MetricConfidence(val level: ConfidenceLevel, val reasons: Set<ConfidenceReason>) {
    val alertAllowed: Boolean get() = level != ConfidenceLevel.LOW
}

/**
 * Data-quality rules from the research (Part 3 §6.2 and the missingness section): missing data
 * is neither zero nor evidence of normal physiology, a thinly covered day is partial, stale data
 * raises no current alert, and confidence is a category. All numeric thresholds here are
 * calibration choices; the research names the checks and leaves the numbers to tuning.
 */
object DataQuality {

    /** Heart-rate readings outside 25–250 bpm are excluded and counted (research test T-DH-5). */
    val HEART_RATE_BPM: ClosedFloatingPointRange<Double> = 25.0..250.0

    /** Valid range of the provider's RMSSD field, ms. */
    val RMSSD_MS: ClosedFloatingPointRange<Double> = 1.0..200.0

    /** Valid range of the provider's SpO2 percentage field. */
    val SPO2_PERCENT: ClosedFloatingPointRange<Double> = 0.0..100.0

    /** A day needs 10 h of wear to count as complete (the gate of the weekly activity insight). */
    const val MIN_WORN_MINUTES_PER_DAY = 600

    /** Nights of baseline for a provisional and for a stable baseline (research baseline policy). */
    const val PROVISIONAL_BASELINE_DAYS = 14
    const val STABLE_BASELINE_DAYS = 21

    /** Coverage at or above which a reading is fully usable, and below which it is sparse. */
    const val ADEQUATE_COVERAGE = 0.8
    const val MINIMUM_COVERAGE = 0.5

    /** A sync older than this no longer supports a statement about "today". */
    const val STALE_AFTER_HOURS = 24.0

    /**
     * Coverage = valid samples / expected samples (RT05 for SpO2 during the sleep period; the
     * same ratio for heart rate). Null when nothing was expected, so that "no sleep period" is
     * not reported as 0 % or 100 % coverage. Evidence class A as a quality metric: it makes no
     * health claim.
     */
    fun coverage(validCount: Int, expectedCount: Int): Coverage? {
        if (expectedCount <= 0 || validCount < 0) return null
        return Coverage(validCount, expectedCount)
    }

    /** Keeps the finite values inside [range] and counts the rest; rejected values are never repaired. */
    fun filterPlausible(values: List<Double>, range: ClosedFloatingPointRange<Double>): PlausibilityResult {
        val valid = values.filter { it.isFinite() && it in range }
        return PlausibilityResult(valid, values.size - valid.size)
    }

    /**
     * Wear-time flag from heart-rate coverage (research register MD12): the number of minutes of
     * the day that have a heart-rate reading stands in for minutes worn.
     *
     * @param wornMinutes minutes with a heart-rate reading; null when unknown.
     */
    fun dayCompleteness(wornMinutes: Int?, minWornMinutes: Int = MIN_WORN_MINUTES_PER_DAY): DayCompleteness = when {
        wornMinutes == null || wornMinutes <= 0 -> DayCompleteness.MISSING
        wornMinutes < minWornMinutes -> DayCompleteness.PARTIAL
        else -> DayCompleteness.COMPLETE
    }

    /**
     * Categorical confidence (research, "Data quality, missingness and confidence"):
     *
     *  - LOW: no reading, stale sync, no baseline yet, sparse coverage or implausible values.
     *    No alert is raised.
     *  - MODERATE: usable, but the baseline is provisional (14–20 days), coverage is partial, or
     *    a known confounder is tagged.
     *  - HIGH: none of the above.
     */
    fun confidence(inputs: ConfidenceInputs): MetricConfidence {
        val low = LinkedHashSet<ConfidenceReason>()
        val moderate = LinkedHashSet<ConfidenceReason>()

        if (!inputs.hasCurrentReading) low += ConfidenceReason.NO_CURRENT_READING
        val age = inputs.hoursSinceLastSync
        if (age == null || !age.isFinite() || age > STALE_AFTER_HOURS) low += ConfidenceReason.STALE_DATA
        when {
            inputs.baselineValidDays < PROVISIONAL_BASELINE_DAYS -> low += ConfidenceReason.BASELINE_NOT_ESTABLISHED
            inputs.baselineValidDays < STABLE_BASELINE_DAYS -> moderate += ConfidenceReason.BASELINE_PROVISIONAL
        }
        val coverage = inputs.coverageFraction
        if (coverage != null) {
            when {
                !coverage.isFinite() || coverage < MINIMUM_COVERAGE -> low += ConfidenceReason.SPARSE_COVERAGE
                coverage < ADEQUATE_COVERAGE -> moderate += ConfidenceReason.PARTIAL_COVERAGE
            }
        }
        if (inputs.implausibleValues) low += ConfidenceReason.IMPLAUSIBLE_VALUES
        if (inputs.confounders > 0) moderate += ConfidenceReason.KNOWN_CONFOUNDER

        val level = when {
            low.isNotEmpty() -> ConfidenceLevel.LOW
            moderate.isNotEmpty() -> ConfidenceLevel.MODERATE
            else -> ConfidenceLevel.HIGH
        }
        return MetricConfidence(level, low + moderate)
    }

    /**
     * Nights whose UTC offset differs from the most common offset of the [windowNights] nights
     * ending on them (research time-zone rule: flag them and keep them out of the regularity
     * metrics SL03–SL05). When two offsets are equally common in a window nothing is flagged,
     * because the usual one cannot be told.
     *
     * Limitation: after a daylight-saving change the first nights on the new offset are flagged
     * too, although the person's clock did not move. A caller that knows the time zone, not just
     * the offset, should clear those.
     *
     * @param offsetMinutesByWakeDay UTC offset in minutes recorded with each night, keyed by wake date.
     */
    fun daysWithUnusualOffset(offsetMinutesByWakeDay: Map<Long, Int>, windowNights: Int = 7): Set<Long> {
        require(windowNights >= 2) { "windowNights must be >= 2" }
        val flagged = LinkedHashSet<Long>()
        for ((day, offset) in offsetMinutesByWakeDay) {
            val counts = ((day - windowNights + 1)..day)
                .mapNotNull { offsetMinutesByWakeDay[it] }
                .groupingBy { it }
                .eachCount()
            val top = counts.values.max()
            val modes = counts.filterValues { it == top }.keys
            if (modes.size == 1 && offset != modes.single()) flagged += day
        }
        return flagged
    }
}
