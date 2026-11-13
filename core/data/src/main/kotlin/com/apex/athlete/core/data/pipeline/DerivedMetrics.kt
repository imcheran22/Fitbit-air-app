package com.apex.athlete.core.data.pipeline

import com.apex.athlete.core.analytics.energy.EnergyEngine
import com.apex.athlete.core.analytics.energy.EnergyInput
import com.apex.athlete.core.analytics.energy.EnergyMissing
import com.apex.athlete.core.analytics.energy.EnergyResult
import com.apex.athlete.core.analytics.journal.DailyOutcome
import com.apex.athlete.core.analytics.journal.JournalEffects
import com.apex.athlete.core.analytics.journal.JournalEffect
import com.apex.athlete.core.analytics.journal.JournalEffectsReport
import com.apex.athlete.core.analytics.journal.JournalEntry
import com.apex.athlete.core.analytics.sleep.DipMissing
import com.apex.athlete.core.analytics.sleep.HeartRateDip
import com.apex.athlete.core.analytics.sleep.HeartRateDipResult
import com.apex.athlete.core.analytics.strain.HeartRateRecovery
import com.apex.athlete.core.analytics.strain.HeartRateRecoveryInput
import com.apex.athlete.core.analytics.strain.HeartRateRecoveryResult
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.stress.MinuteHeartRate
import com.apex.athlete.core.analytics.stress.MinuteRange
import com.apex.athlete.core.analytics.stress.MinuteSteps
import com.apex.athlete.core.analytics.stress.MinuteStress
import com.apex.athlete.core.analytics.stress.StressBaseline
import com.apex.athlete.core.analytics.stress.StressDayInput
import com.apex.athlete.core.analytics.stress.StressEngine
import com.apex.athlete.core.analytics.stress.StressMissing
import com.apex.athlete.core.analytics.stress.StressSummary
import com.apex.athlete.core.domain.MetricType

/*
 * The decisions the pipeline makes around the version-4 engines, kept free of the database so they can
 * be tested without Android: which minutes are still, when stress/energy are unavailable and why, how
 * journal days are paired, how BMI is derived. The pipeline only fetches rows and calls these.
 * Every function returns null plus a reason for missing input; none returns 0 for "no data".
 */

internal const val MINUTE_MS = 60_000L

/** Absolute minute index (UTC epoch milliseconds / 60 000, rounded down). */
internal fun minuteOf(epochMillis: Long): Long = Math.floorDiv(epochMillis, MINUTE_MS)

/** First minute index at or after [epochMillis]. */
internal fun minuteCeil(epochMillis: Long): Long = -Math.floorDiv(-epochMillis, MINUTE_MS)

/** Half-open millisecond span as the minutes it touches: [floor(start), ceil(end)). Empty or reversed spans give an empty range. */
internal fun minuteRangeOf(startMillis: Long, endMillis: Long): MinuteRange {
    val a = minuteOf(startMillis)
    return MinuteRange(a, maxOf(a, minuteCeil(endMillis)))
}

// --- Daytime stress --------------------------------------------------------------------------------

/** Why a day has no stress summary. Screens turn each into a sentence; none is ever shown as a number. */
enum class StressMissingReason {
    NO_HEART_RATE_DATA,

    /** No step interval covers the day, so still minutes cannot be told from walking: nothing is guessed. */
    NO_MOTION_DATA,
    BASELINE_CALIBRATING,
    TOO_FEW_MINUTES,
}

/** A step count over an interval ([endMillis] null = one minute). Sources deliver minute, 5-minute or 15-minute buckets. */
data class StepInterval(val startMillis: Long, val endMillis: Long?, val steps: Double)

/**
 * @property summary null while calibrating, with too few still minutes, or without heart rate or motion data.
 * @property dayAggregateBpm the day's resting daytime heart rate; present even while calibrating (it feeds later baselines).
 */
data class StressOutcome(
    val summary: StressSummary?,
    val minuteLevels: List<MinuteStress>,
    val dayAggregateBpm: Double?,
    val baseline: StressBaseline?,
    val missing: StressMissingReason?,
)

object StressDay {
    /** An interval longer than this is not a step bucket (a day total mislabelled as an interval); it is ignored for gating. */
    const val MAX_INTERVAL_MINUTES = 60

    /**
     * Minutes with motion. Every minute of an interval with steps above zero counts as motion (a 15-minute
     * bucket with steps says the person moved somewhere in it, so none of it is called still).
     */
    fun motionMinutes(intervals: List<StepInterval>): List<MinuteSteps> {
        val out = ArrayList<MinuteSteps>()
        for (iv in intervals) {
            if (!iv.steps.isFinite() || iv.steps <= 0.0) continue
            val first = minuteOf(iv.startMillis)
            val end = iv.endMillis?.let { minuteCeil(it) } ?: (first + 1)
            val last = maxOf(first + 1, end)
            if (last - first > MAX_INTERVAL_MINUTES) continue
            val perMinute = maxOf(1, (iv.steps / (last - first)).toInt())
            for (m in first until last) out.add(MinuteSteps(m, perMinute))
        }
        return out
    }

    /**
     * @param excluded workouts and every sleep session or nap of the day, in milliseconds.
     * @param priorAggregates the stored day aggregates of the days before this one, oldest first, null for a day without one.
     */
    fun evaluate(
        dayStartMillis: Long,
        dayEndMillis: Long,
        heartRate: List<MinuteHeartRate>,
        stepIntervals: List<StepInterval>,
        excluded: List<LongRange>,
        priorAggregates: List<Double?>,
    ): StressOutcome {
        val startMinute = minuteOf(dayStartMillis)
        val endMinute = minuteOf(dayEndMillis)
        val hr = heartRate.filter { it.minute in startMinute until endMinute }
        if (hr.isEmpty()) return StressOutcome(null, emptyList(), null, null, StressMissingReason.NO_HEART_RATE_DATA)
        val covering = stepIntervals.filter { it.startMillis < dayEndMillis && (it.endMillis ?: (it.startMillis + MINUTE_MS)) > dayStartMillis }
        if (covering.isEmpty()) return StressOutcome(null, emptyList(), null, null, StressMissingReason.NO_MOTION_DATA)

        val baseline = StressEngine.baselineFrom(priorAggregates)
        val input = StressDayInput(
            dayStartMinute = startMinute,
            dayEndMinuteExclusive = endMinute,
            heartRate = hr,
            steps = motionMinutes(covering),
            excluded = excluded.map { MinuteRange(it.first, maxOf(it.first, it.last + 1)) },
        )
        val r = StressEngine.evaluate(input, baseline)
        val missing = when (r.missing) {
            StressMissing.BASELINE_CALIBRATING -> StressMissingReason.BASELINE_CALIBRATING
            StressMissing.TOO_FEW_MINUTES -> StressMissingReason.TOO_FEW_MINUTES
            null -> null
        }
        return StressOutcome(r.summary, r.minuteLevels, r.dayAggregateBpm, baseline, missing)
    }
}

/** Millisecond span as a [LongRange] of minutes touched: [floor(start), ceil(end) - 1]. Use with [StressDay.evaluate]. */
internal fun minuteSpan(startMillis: Long, endMillis: Long): LongRange {
    val r = minuteRangeOf(startMillis, endMillis)
    return r.startMinute until r.endMinuteExclusive
}

// --- Energy bank -----------------------------------------------------------------------------------

enum class EnergyMissingReason {
    NO_RECOVERY,
    NO_WAKE_TIME,

    /** No heart-rate zone model (needs a resting and a maximum heart rate). */
    NEEDS_ZONES,
    NO_HEART_RATE_DATA,
    EMPTY_SPAN,
}

data class EnergyOutcomeDay(val result: EnergyResult?, val missing: EnergyMissingReason?)

object EnergyDay {
    /** Heart-rate minutes the awake span needs before a curve is drawn; below it the band was mostly off (calibration choice). */
    const val MIN_HEART_RATE_MINUTES = 60

    /**
     * The curve runs from wake to the end of the civil day, or to [nowMillis] for a day still in progress.
     * Stress levels may be empty (stress calibrating): those minutes carry only the basal and activity terms and
     * the result says how many minutes had no stress level.
     */
    fun evaluate(
        recovery: Double?,
        wakeMillis: Long?,
        dayEndMillis: Long,
        nowMillis: Long,
        zones: HeartRateZoneModel?,
        heartRate: List<MinuteHeartRate>,
        stressLevels: List<MinuteStress>,
        naps: List<MinuteRange>,
    ): EnergyOutcomeDay {
        if (recovery == null) return EnergyOutcomeDay(null, EnergyMissingReason.NO_RECOVERY)
        if (wakeMillis == null) return EnergyOutcomeDay(null, EnergyMissingReason.NO_WAKE_TIME)
        if (zones == null) return EnergyOutcomeDay(null, EnergyMissingReason.NEEDS_ZONES)
        val wake = minuteCeil(wakeMillis)
        val until = minOf(minuteOf(dayEndMillis), minuteOf(nowMillis) + 1)
        if (until <= wake) return EnergyOutcomeDay(null, EnergyMissingReason.EMPTY_SPAN)
        val inSpan = heartRate.filter { it.minute in wake until until }
        if (inSpan.map { it.minute }.distinct().size < MIN_HEART_RATE_MINUTES) {
            return EnergyOutcomeDay(null, EnergyMissingReason.NO_HEART_RATE_DATA)
        }
        val o = EnergyEngine.evaluate(EnergyInput(recovery, wake, until, stressLevels, inSpan, zones, naps))
        return when (o.missing) {
            EnergyMissing.NO_RECOVERY -> EnergyOutcomeDay(null, EnergyMissingReason.NO_RECOVERY)
            EnergyMissing.EMPTY_SPAN -> EnergyOutcomeDay(null, EnergyMissingReason.EMPTY_SPAN)
            null -> EnergyOutcomeDay(o.result, null)
        }
    }
}

// --- Sleeping heart-rate dip -----------------------------------------------------------------------

object HeartRateDipDay {
    /** The waking time before a night is at most this long (a day without a recorded previous wake time is capped). */
    const val MAX_DAYTIME_MS = 24L * 60 * MINUTE_MS

    /** Start of the daytime window: the previous wake time when it is within a day of the onset, else a day before the onset. */
    fun daytimeStart(sleepStartMillis: Long, previousWakeMillis: Long?): Long {
        val floor = sleepStartMillis - MAX_DAYTIME_MS
        return if (previousWakeMillis == null || previousWakeMillis < floor || previousWakeMillis >= sleepStartMillis) floor else previousWakeMillis
    }

    /**
     * @param daytimeHeartRate minute heart rate inside the daytime window.
     * @param excluded workouts, naps and any other sleep inside the window (minutes are dropped, not guessed).
     * @param sleepingHeartRate minute heart rate inside the night.
     */
    fun evaluate(daytimeHeartRate: List<MinuteHeartRate>, excluded: List<LongRange>, sleepingHeartRate: List<MinuteHeartRate>): HeartRateDipResult {
        if (sleepingHeartRate.isEmpty()) return HeartRateDipResult(null, null, DipMissing.NO_SLEEPING_HEART_RATE)
        val awake = daytimeHeartRate.filter { m -> excluded.none { m.minute in it } }
        if (awake.isEmpty()) return HeartRateDipResult(null, null, DipMissing.NO_DAYTIME_HEART_RATE)
        return HeartRateDip.fromMinutes(awake.map { it.bpm }, sleepingHeartRate.map { it.bpm })
    }
}

// --- Post-workout heart-rate recovery --------------------------------------------------------------

object WorkoutRecovery {
    /** Minutes of heart rate needed after the end (the second full minute) and before it (the peak window). */
    const val MINUTES_BEFORE_END = 3
    const val MINUTES_AFTER_END = 2

    /** The zone whose lower bound is the minimum peak: recovery after an easy effort says little (Pulse uses zone 4; calibration choice). */
    const val MIN_PEAK_ZONE_INDEX = 3

    /** Null without a zone model: the "hard enough" test needs one. The caller says "needs a maximum heart rate". */
    fun compute(workoutEndMillis: Long, heartRate: List<MinuteHeartRate>, zones: HeartRateZoneModel?): HeartRateRecoveryResult? {
        if (zones == null) return null
        return HeartRateRecovery.compute(
            HeartRateRecoveryInput(
                workoutEndMinuteExclusive = minuteCeil(workoutEndMillis),
                heartRate = heartRate,
                minPeakBpm = zones.lowerBounds[MIN_PEAK_ZONE_INDEX],
            ),
        )
    }
}

// --- Journal effects -------------------------------------------------------------------------------

object JournalDay {
    /** The yes/no factor metrics the journal can store, in display order. */
    val FACTORS: List<MetricType> = listOf(
        MetricType.JOURNAL_ALCOHOL,
        MetricType.JOURNAL_LATE_CAFFEINE,
        MetricType.JOURNAL_LATE_MEAL,
        MetricType.JOURNAL_STRESSFUL_DAY,
        MetricType.JOURNAL_TRAVEL,
    )

    /**
     * @param factorRows for each factor, day -> stored value (>= 0.5 means yes). A day without a row was not logged.
     * @param recoveryByDay and [rmssdByDay]: the outcomes (overnight, so the value on day d follows the factor of d - 1).
     * Null when no factor has any row in the window: nothing was journalled, so there is nothing to analyse.
     */
    fun analyze(
        factorRows: Map<MetricType, Map<Long, Double>>,
        recoveryByDay: Map<Long, Double>,
        rmssdByDay: Map<Long, Double>,
        asOfDay: Long,
    ): JournalEffectsReport? {
        val days = factorRows.filterKeys { it in FACTORS }.values.flatMap { it.keys }.distinct().sorted()
        if (days.isEmpty()) return null
        val entries = days.map { d ->
            JournalEntry(
                epochDay = d,
                factors = factorRows.filterKeys { it in FACTORS }
                    .mapNotNull { (metric, byDay) -> byDay[d]?.let { metric.storageKey to (it >= 0.5) } }
                    .toMap(),
            )
        }
        val outcomeDays = (recoveryByDay.keys + rmssdByDay.keys).distinct().sorted()
        val outcomes = outcomeDays.map { DailyOutcome(it, recoveryByDay[it], rmssdByDay[it]) }
        return JournalEffects.analyze(entries, outcomes, asOfDay)
    }
}

/** The factor metric a [JournalEffect] was computed for, or null for a key this version does not know. */
fun JournalEffect.factorMetric(): MetricType? = JournalDay.FACTORS.firstOrNull { it.storageKey == factor }

// --- Body mass index -------------------------------------------------------------------------------

object BodyMassIndex {
    /** Heights outside this range are treated as a typing error, not used. */
    const val MIN_HEIGHT_CM = 100.0
    const val MAX_HEIGHT_CM = 250.0

    /** kg / m^2. Null without a plausible height or weight: never guessed from a population value. */
    fun compute(weightKg: Double?, heightCm: Double?): Double? {
        if (weightKg == null || heightCm == null) return null
        if (!weightKg.isFinite() || weightKg <= 0.0 || !heightCm.isFinite() || heightCm !in MIN_HEIGHT_CM..MAX_HEIGHT_CM) return null
        val m = heightCm / 100.0
        return weightKg / (m * m)
    }
}
