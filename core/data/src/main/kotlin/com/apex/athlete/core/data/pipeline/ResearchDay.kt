package com.apex.athlete.core.data.pipeline

import com.apex.athlete.core.analytics.baseline.DualBaseline
import com.apex.athlete.core.analytics.research.AutonomicMetrics
import com.apex.athlete.core.analytics.research.ActivityMetrics
import com.apex.athlete.core.analytics.research.ClockVariability
import com.apex.athlete.core.analytics.research.GuidelineSleepShortfall
import com.apex.athlete.core.analytics.research.MetricConfidence
import com.apex.athlete.core.analytics.research.MinuteSpan
import com.apex.athlete.core.analytics.research.PatternMatch
import com.apex.athlete.core.analytics.research.SedentaryDay
import com.apex.athlete.core.analytics.research.SleepNight
import com.apex.athlete.core.analytics.research.SleepRegularity as SleepResearch
import com.apex.athlete.core.analytics.research.SwcStatus
import com.apex.athlete.core.analytics.trend.WeeklyHrvStatus
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.domain.SleepStage

/** Why the minute-step activity metrics (sedentary bouts, peak cadence) are not shown for a day. */
enum class ActivityResearchMissing {
    /** The day is still running; a partial day would give a misleading longest bout. */
    DAY_NOT_COMPLETE,

    /** No step data for the day. */
    NO_STEP_DATA,

    /** Steps arrived in buckets longer than a minute, so minutes cannot be told apart: nothing is guessed. */
    COARSE_STEP_DATA,

    /** Fewer than 10 observed waking hours. */
    TOO_FEW_MINUTES,
}

/**
 * Research metrics for one day (formula version 6, docs/RESEARCH_GAP_MATRIX.md). Every field is null when its inputs are
 * missing. All values are descriptive: "different from your usual", never diagnostic. Provenance of each stored value is
 * MATHEMATICALLY_DERIVED. The dual baselines sit next to, and never replace, the mean/SD baselines behind the scores.
 */
data class ResearchInsights(
    /** Mean/SD and median/MAD baselines side by side ("usual" = median, "average" = mean); see [DualBaseline]. */
    val hrvDual: DualBaseline?,
    val restingHeartRateDual: DualBaseline?,
    val sleepingHeartRateDual: DualBaseline?,
    val respiratoryRateDual: DualBaseline?,
    /** CV of ln RMSSD over the last 7 nights, percent. */
    val hrvCv7LnPercent: Double?,
    /** Weekly HRV against the +-0.5 SD smallest-worthwhile-change band. */
    val hrvSwc: SwcStatus?,
    val hrvPercentFromBaseline: Double?,
    /** Last 7 main sleeps (naps excluded) against 7 h. "Shortfall against 7 h", not sleep debt. */
    val guidelineShortfall: GuidelineSleepShortfall?,
    val sleepMidpointMinuteOfDay: Double?,
    val sleepMidpointSd7: ClockVariability?,
    val wasoMinutes: Double?,
    /** Awakenings longer than 3 minutes per hour asleep. */
    val awakeningsPerHour: Double?,
    val sedentary: SedentaryDay?,
    val peakCadence30: Double?,
    val activityMissing: ActivityResearchMissing?,
    /** Multi-signal patterns evaluated for the day. Wording is always "may indicate"; see [PatternMatch.message]. */
    val patterns: List<PatternMatch>,
    val dataConfidence: MetricConfidence?,
) {
    /** Detected patterns that passed data-quality and tag suppression, i.e. those an alert may be built on. */
    val alertablePatterns: List<PatternMatch> get() = patterns.filter { it.detected && it.alertAllowed }

    companion object {
        val EMPTY = ResearchInsights(
            null, null, null, null, null, null, null, null, null, null, null, null, null, null,
            ActivityResearchMissing.NO_STEP_DATA, emptyList(), null,
        )
    }
}

internal object ResearchDay {
    const val SHORTFALL_NIGHTS = 7
    private const val MAX_STEP_BUCKET_MS = 90_000L

    fun hrvSwc(status: WeeklyHrvStatus?): SwcStatus? = status?.let(AutonomicMetrics::swcStatus)

    fun hrvPercent(status: WeeklyHrvStatus?): Double? = status?.let(AutonomicMetrics::percentFromBaseline)

    /** Local minute index (wall clock) of an instant, using the offset recorded with the session. */
    private fun localMinute(epochMillis: Long, offsetSeconds: Int): Long = Math.floorDiv(epochMillis + offsetSeconds * 1000L, 60_000L)

    private fun periodOf(s: SleepSessionEntity): MinuteSpan? {
        val a = localMinute(s.startEpochMillis, s.startZoneOffsetSeconds)
        val b = localMinute(s.endEpochMillis, s.endZoneOffsetSeconds)
        return if (b > a) MinuteSpan(a, b) else null
    }

    /** Midpoint of one main sleep as local minutes after midnight. */
    fun midpointOf(s: SleepSessionEntity): Double? = periodOf(s)?.let(SleepResearch::midpointMinuteOfDay)

    /** Shortfall over the main sleeps of the 7 days ending on [day]; a night without a session is missing, not zero. */
    fun shortfall(day: Long, mainSleeps: List<SleepSessionEntity>): GuidelineSleepShortfall? =
        SleepResearch.guidelineShortfall(
            ((day - SHORTFALL_NIGHTS + 1)..day).map { d -> mainSleeps.firstOrNull { it.epochDay == d }?.minutesAsleep?.toDouble() },
        )

    fun midpointSd(day: Long, mainSleeps: List<SleepSessionEntity>): ClockVariability? =
        SleepResearch.clockVariability(
            ((day - SHORTFALL_NIGHTS + 1)..day).mapNotNull { d -> mainSleeps.firstOrNull { it.epochDay == d }?.let(::midpointOf) },
        )

    /** WASO needs scored stages: without them it is unknown, never 0. */
    fun waso(night: SleepSessionEntity, stages: List<SleepStageSegmentEntity>): Double? {
        val period = periodOf(night) ?: return null
        val hasStages = night.hasStages && stages.isNotEmpty()
        val awake = stages.filter { it.stage == SleepStage.AWAKE && it.endEpochMillis > it.startEpochMillis }.mapNotNull {
            val a = localMinute(it.startEpochMillis, night.startZoneOffsetSeconds)
            val b = localMinute(it.endEpochMillis, night.startZoneOffsetSeconds)
            if (b > a) MinuteSpan(a, b) else null
        }
        return SleepResearch.wasoMinutes(SleepNight(night.epochDay, period, awake), hasStages)
    }

    fun awakeningsPerHour(night: SleepSessionEntity): Double? =
        SleepResearch.awakeningsPerHour(night.wakeBoutsOverThreeMinutes, night.minutesAsleep.toDouble())

    class Activity(val sedentary: SedentaryDay?, val peakCadence30: Double?, val missing: ActivityResearchMissing?)

    /**
     * Minute steps of a day from one-minute step buckets. A minute counts as observed when a step bucket or a heart-rate
     * minute exists for it; an observed minute without a step bucket has 0 steps. Any bucket longer than 90 s makes the
     * day unavailable (minutes cannot be told apart), as does a day still in progress.
     */
    fun activity(
        dayStartMillis: Long,
        dayEndMillis: Long,
        provisional: Boolean,
        steps: List<StepInterval>,
        heartRateMinutes: Collection<Long>,
        asleep: List<LongRange>,
    ): Activity {
        fun none(reason: ActivityResearchMissing) = Activity(null, null, reason)
        if (provisional) return none(ActivityResearchMissing.DAY_NOT_COMPLETE)
        val inDay = steps.filter { it.startMillis < dayEndMillis && (it.endMillis ?: (it.startMillis + MINUTE_MS)) > dayStartMillis }
        if (inDay.isEmpty()) return none(ActivityResearchMissing.NO_STEP_DATA)
        if (inDay.any { (it.endMillis ?: (it.startMillis + MINUTE_MS)) - it.startMillis > MAX_STEP_BUCKET_MS }) {
            return none(ActivityResearchMissing.COARSE_STEP_DATA)
        }
        val first = minuteOf(dayStartMillis)
        val size = (minuteOf(dayEndMillis) - first).toInt()
        val minutes = arrayOfNulls<Int>(size)
        for (m in heartRateMinutes) (m - first).toInt().takeIf { it in 0 until size }?.let { minutes[it] = 0 }
        for (s in inDay) {
            val i = (minuteOf(s.startMillis) - first).toInt()
            if (i in 0 until size && s.steps.isFinite() && s.steps >= 0.0) minutes[i] = (minutes[i] ?: 0) + s.steps.toInt()
        }
        val list = minutes.toList()
        val asleepIdx = asleep.mapNotNull { r ->
            val a = (r.first - first).coerceIn(0, size.toLong()).toInt()
            val b = (r.last - first).coerceIn(-1, size.toLong() - 1).toInt()
            if (b >= a) a..b else null
        }
        val sed = ActivityMetrics.sedentaryDay(list, asleepIdx)
        val peak = ActivityMetrics.peakCadence(list)
        return Activity(sed, peak, if (sed == null && peak == null) ActivityResearchMissing.TOO_FEW_MINUTES else null)
    }
}
