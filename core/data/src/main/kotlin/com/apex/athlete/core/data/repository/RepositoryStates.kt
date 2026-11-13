package com.apex.athlete.core.data.repository

import com.apex.athlete.core.analytics.energy.EnergyResult
import com.apex.athlete.core.analytics.fitness.FitnessAgeResult
import com.apex.athlete.core.analytics.fitness.Vo2CategoryResult
import com.apex.athlete.core.analytics.journal.JournalEffectsReport
import com.apex.athlete.core.analytics.strain.HeartRateRecoveryResult
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.stress.MinuteStress
import com.apex.athlete.core.analytics.stress.StressBaseline
import com.apex.athlete.core.analytics.stress.StressSummary
import com.apex.athlete.core.data.pipeline.DayAnalysis
import com.apex.athlete.core.data.pipeline.EnergyMissingReason
import com.apex.athlete.core.data.pipeline.StressMissingReason
import com.apex.athlete.core.data.pipeline.Vo2MaxReading
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType

/*
 * What the new screens observe (formula version 4 and the activity, body and vitals streams).
 * Rules shared by every type here:
 *  - a value is null when it is missing, never 0, and says why ([ReadingMissing], or the engine's own reason);
 *  - a value that exists carries its provenance and, when it is not from the day asked for, the day it was measured.
 */

/** Why a [MetricReading] has no value. */
enum class ReadingMissing {
    /** No row for the day (band off, not synced, or this source does not deliver it). */
    NO_DATA,

    /** BMI needs a height; add it in the profile. */
    NEEDS_HEIGHT,

    /** BMI needs a weight (a weigh-in or the profile weight). */
    NEEDS_WEIGHT,
}

/**
 * One stored (or derived-on-read) value.
 * @property epochDay the day it was measured; null for a value that has no day (profile weight).
 * @property provenance where it came from; null only when [value] is null.
 * @property sampleCount underlying samples when known (for example the overnight windows behind an HRV mean).
 */
data class MetricReading(
    val metric: MetricType,
    val value: Double?,
    val epochDay: Long?,
    val provenance: DataProvenance?,
    val missing: ReadingMissing?,
    val sampleCount: Int? = null,
) {
    companion object {
        fun absent(metric: MetricType, reason: ReadingMissing = ReadingMissing.NO_DATA) =
            MetricReading(metric, null, null, null, reason)
    }
}

/** Metrics shown in the day's activity summary, in display order. */
val ACTIVITY_METRICS: List<MetricType> = listOf(
    MetricType.STEPS,
    MetricType.DISTANCE,
    MetricType.FLOORS,
    MetricType.CALORIES_TOTAL,
    MetricType.CALORIES_ACTIVE,
    MetricType.ACTIVE_ZONE_MINUTES,
    MetricType.LIGHTLY_ACTIVE_MINUTES,
    MetricType.MODERATELY_ACTIVE_MINUTES,
    MetricType.VERY_ACTIVE_MINUTES,
    MetricType.SEDENTARY_MINUTES,
)

/** Vitals read for one night, in display order. The two HRV frequency bands are stored as raw samples and read as the night's mean. */
val VITALS_METRICS: List<MetricType> = listOf(
    MetricType.SKIN_TEMP_NIGHTLY,
    MetricType.SPO2_LOWER_BOUND,
    MetricType.SPO2_UPPER_BOUND,
    MetricType.HRV_DEEP_SLEEP_RMSSD,
    MetricType.HRV_SLEEP_SAMPLES,
    MetricType.HRV_LOW_FREQUENCY,
    MetricType.HRV_HIGH_FREQUENCY,
    MetricType.SLEEPING_HEART_RATE,
)

/**
 * One day of activity. [readings] has an entry for every metric in [ACTIVITY_METRICS]; one without a value says why.
 * The current day is provisional: its totals are still accumulating ([isProvisional]).
 */
data class ActivityDayState(
    val analysis: DayAnalysis,
    val isDemo: Boolean,
    val epochDay: Long,
    val isProvisional: Boolean,
    val readings: Map<MetricType, MetricReading>,
    val workouts: List<WorkoutEntity>,
    /** Steps of the 14 days ending on [epochDay]; null on days without a reading (a gap, never 0). */
    val stepsHistory: List<TrendPoint>,
)

/**
 * Weight, body fat and BMI. BMI is derived on read from the latest weight and the profile height (never stored); it is null
 * with a reason when either is missing. A weight without a weigh-in falls back to the profile weight, labelled user-reported.
 */
data class BodyState(
    val isDemo: Boolean,
    val epochDay: Long,
    val heightCm: Double?,
    val weight: MetricReading,
    val bodyFat: MetricReading,
    val bmi: MetricReading,
    val weightHistory: List<TrendPoint>,
    val bodyFatHistory: List<TrendPoint>,
    /** BMI at each weigh-in of [weightHistory]; all null without a height. */
    val bmiHistory: List<TrendPoint>,
)

/** The night that ended on [epochDay]: every metric in [VITALS_METRICS] has an entry. */
data class VitalsState(
    val isDemo: Boolean,
    val epochDay: Long,
    val readings: Map<MetricType, MetricReading>,
)

/**
 * Daytime stress and the energy bank for one day. Stress is heart rate while still against the athlete's own baseline
 * (not a psychological measure); energy is a model that starts at the morning recovery (not a physiological measurement).
 * Both are derived ([provenance]); each is null with a reason when its inputs are missing, for example on a band-off day.
 */
data class StressEnergyState(
    val isDemo: Boolean,
    val epochDay: Long,
    val isProvisional: Boolean,
    val stress: StressSummary?,
    val stressMinuteLevels: List<MinuteStress>,
    val stressDayAggregateBpm: Double?,
    val stressBaseline: StressBaseline?,
    val stressMissing: StressMissingReason?,
    val stressHistory: List<TrendPoint>,
    val energy: EnergyResult?,
    val energyMissing: EnergyMissingReason?,
    val provenance: DataProvenance = DataProvenance.MATHEMATICALLY_DERIVED,
)

/**
 * The journal for one day and the next-day associations built from the last 90 days. [factors] has an entry for every
 * factor the journal knows ([com.apex.athlete.core.data.pipeline.JournalDay.FACTORS]): true = yes, false = no, null = not logged.
 * [effects] is null when nothing has been journalled; a factor with fewer than 5 days in an arm appears under `skipped`.
 */
data class JournalState(
    val isDemo: Boolean,
    val epochDay: Long,
    val factors: Map<MetricType, Boolean?>,
    val effects: JournalEffectsReport?,
    val provenance: DataProvenance = DataProvenance.USER_REPORTED,
)

/**
 * VO2 max with its category and fitness age against FRIEND norms. [vo2Max] carries where the number came from (the band, or an
 * ESTIMATED value from heart rates). [category] and [fitnessAge] have no value, with a reason, while sex or age is missing in the profile.
 */
data class FitnessState(
    val isDemo: Boolean,
    val epochDay: Long,
    val vo2Max: Vo2MaxReading?,
    val category: Vo2CategoryResult,
    val fitnessAge: FitnessAgeResult,
    val vo2History: List<TrendPoint>,
)

/**
 * A workout opened for detail. Calories, distance, steps, active zone minutes and elevation are on [workout] (null = not reported).
 * [recovery] is null only without a zone model ([recoveryNeedsZones]); otherwise it carries a missing reason when the minutes are absent.
 */
data class WorkoutDetailState(
    val workout: WorkoutEntity,
    val isDemo: Boolean,
    val recovery: HeartRateRecoveryResult?,
    val recoveryNeedsZones: Boolean,
    /** Minutes in each zone during the workout; null without a zone model. */
    val zoneMinutes: Map<HeartRateZone, Double>?,
    /** Minute heart rate during the workout (gaps are absent, not zero). */
    val heartRate: List<HeartRateTick>,
)
