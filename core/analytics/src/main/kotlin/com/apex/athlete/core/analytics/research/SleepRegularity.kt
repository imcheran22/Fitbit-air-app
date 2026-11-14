package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.stats.CircularTime
import com.apex.athlete.core.analytics.stats.Stats

/**
 * A closed-open stretch of local wall-clock time, in minutes since 1970-01-01 00:00 on the
 * clock the person lived by: `epochDay · 1440 + minuteOfDay`. Each instant is converted with
 * the UTC offset recorded with it, so 23:30 is 23:30 on every night, whatever the time zone or
 * daylight-saving state.
 */
data class MinuteSpan(val startMinute: Long, val endMinute: Long) {
    init {
        require(endMinute > startMinute) { "a span must end after it starts" }
    }

    val minutes: Long get() = endMinute - startMinute
}

/**
 * One main sleep. Naps are passed separately; they never enter nightly metrics.
 *
 * @property wakeEpochDay civil date of waking; a night belongs to the day it ended on.
 * @property period sleep period from onset to final waking.
 * @property awake stretches inside [period] scored AWAKE. Empty when the source gave no stages.
 * @property manuallyEdited the user edited the log; callers should leave such nights out of
 *   regularity metrics.
 * @property offsetDiffersFromUsual the night's UTC offset differs from the person's usual one
 *   (travel); see [DataQuality.daysWithUnusualOffset]. Callers should leave it out of regularity metrics.
 */
data class SleepNight(
    val wakeEpochDay: Long,
    val period: MinuteSpan,
    val awake: List<MinuteSpan> = emptyList(),
    val manuallyEdited: Boolean = false,
    val offsetDiffersFromUsual: Boolean = false,
) {
    val usableForRegularity: Boolean get() = !manuallyEdited && !offsetDiffersFromUsual
}

/**
 * Spread of a clock time over several nights.
 *
 * @property meanMinuteOfDay typical clock time, minutes after midnight in 0 until 1440.
 * @property sdMinutes sample standard deviation in minutes, computed across midnight correctly.
 */
data class ClockVariability(val meanMinuteOfDay: Double, val sdMinutes: Double, val nights: Int)

/**
 * SL05. Difference between the mean sleep midpoint on free days and on work days.
 *
 * @property signedHours positive when sleep is later on free days.
 */
data class SocialJetlag(
    val workMidpointMinuteOfDay: Double,
    val freeMidpointMinuteOfDay: Double,
    val signedHours: Double,
    val workNights: Int,
    val freeNights: Int,
) {
    val absoluteHours: Double get() = kotlin.math.abs(signedHours)
}

/**
 * SL01. A week of total sleep time against the guideline minimum.
 *
 * @property nightsAtOrAboveGuideline nights of at least [guidelineMinutes].
 */
data class SleepDurationSummary(
    val stats: DescriptiveSummary,
    val guidelineMinutes: Double,
    val nightsAtOrAboveGuideline: Int,
    val missingNights: Int,
)

/**
 * SL08. Guideline sleep shortfall: estimated shortfall against the 7 h guideline or the user's own target;
 * never "debt owed". Secondary to the personal sleep debt ([com.apex.athlete.core.analytics.sleep.SleepNeed.accumulatedDebtMinutes],
 * which is primary, docs/DECISIONS.md D17); the two names must stay distinct in the UI ("sleep debt" vs
 * "shortfall against 7 h").
 *
 * @property clippedMinutes Σ max(0, target − TST): nights above the target earn no credit.
 * @property signedMinutes Σ (target − TST): long nights offset short ones. Negative = surplus.
 * @property missingNights nights of the window without a reading. They add nothing to either
 *   sum, so with missing nights both sums understate a real shortfall.
 */
data class GuidelineSleepShortfall(
    val targetMinutes: Double,
    val clippedMinutes: Double,
    val signedMinutes: Double,
    val validNights: Int,
    val missingNights: Int,
) {
    /** Clipped shortfall per valid night; comparable between windows with different gaps. */
    val meanClippedPerNight: Double get() = clippedMinutes / validNights
}

object SleepRegularity {

    private const val DAY = 1440

    /** Adult guideline minimum of 7 h per night (Watson et al. 2015, AASM/SRS consensus). */
    const val GUIDELINE_MINUTES = 420.0

    // ------------------------------------------------------------------- SL03 (not here)
    // The Sleep Regularity Index lives in sleep/SleepRegularityIndex.kt (formula version 3) and scores the sleep score's
    // consistency part. The research's own SRI variant (14 windows, naps unknown, AWAKE stages removed) was removed here
    // as a duplicate; the convention differences are listed in docs/RESEARCH_GAP_MATRIX.md.

    /** The sleep period with its AWAKE stretches removed. */
    private fun asleepSpans(night: SleepNight): List<MinuteSpan> {
        val out = ArrayList<MinuteSpan>()
        var cursor = night.period.startMinute
        for (a in night.awake.sortedBy { it.startMinute }) {
            val start = a.startMinute.coerceIn(night.period.startMinute, night.period.endMinute)
            val end = a.endMinute.coerceIn(night.period.startMinute, night.period.endMinute)
            if (start > cursor) out += MinuteSpan(cursor, start)
            cursor = maxOf(cursor, end)
        }
        if (night.period.endMinute > cursor) out += MinuteSpan(cursor, night.period.endMinute)
        return out
    }

    // ------------------------------------------------------------ SL04 / SL10 timing spread

    /** SL04. Midpoint of a sleep period, `start + (end − start) / 2`, as minutes after midnight. */
    fun midpointMinuteOfDay(period: MinuteSpan): Double {
        val mid = period.startMinute + period.minutes / 2.0
        return ((mid % DAY) + DAY) % DAY
    }

    /** Clock time at which a sleep period began (SL10 bedtime), minutes after midnight. */
    fun onsetMinuteOfDay(period: MinuteSpan): Double = Math.floorMod(period.startMinute, DAY.toLong()).toDouble()

    /** Clock time at which a sleep period ended, minutes after midnight. */
    fun wakeMinuteOfDay(period: MinuteSpan): Double = Math.floorMod(period.endMinute, DAY.toLong()).toDouble()

    /**
     * SL04 / SL10. Mean and sample SD of a clock time (sleep midpoint, bedtime or wake time)
     * over a run of nights (Roenneberg et al. 2012; Phillips et al. 2017). Evidence class B: the
     * measure is standard, no individual cut-off exists.
     *
     * Clock times wrap at midnight, so the values are first laid out around their circular mean
     * and the ordinary mean and SD are then taken; for nights that do not straddle midnight this
     * equals the plain arithmetic result. The research computes the spread over 7 and 14 nights;
     * the 5-night minimum is a calibration choice (pass 10 for a 14-night window).
     *
     * Bedtime and wake-time spread for display already exist as the circular SD in
     * [com.apex.athlete.core.analytics.sleep.SleepScoreResult.onsetStdDevMinutes] / `wakeStdDevMinutes`; use this
     * function for the sleep midpoint (SL04) so one screen never shows two definitions of the same spread.
     *
     * @param minutesOfDay one clock time per night, minutes after midnight.
     */
    fun clockVariability(minutesOfDay: List<Double>, minNights: Int = 5): ClockVariability? {
        val valid = minutesOfDay.filter { it.isFinite() }
        if (valid.size < maxOf(minNights, 2)) return null
        val unwrapped = unwrap(valid, CircularTime.meanMinuteOfDay(valid) ?: return null)
        val mean = Stats.mean(unwrapped)!!
        return ClockVariability(
            meanMinuteOfDay = ((mean % DAY) + DAY) % DAY,
            sdMinutes = Stats.sampleStdDev(unwrapped)!!,
            nights = valid.size,
        )
    }

    /** Places each clock time within ±12 h of [reference] so ordinary arithmetic applies. */
    private fun unwrap(minutes: List<Double>, reference: Double): List<Double> =
        minutes.map { reference + CircularTime.signedDifference(it, reference) }

    // ------------------------------------------------------------------- SL05 social jetlag

    /**
     * SL05. Social jetlag, simple form: `(mean midpoint on free days − mean midpoint on work
     * days) / 60` hours (Roenneberg et al. 2012).
     *
     * Evidence class B: associated with BMI in a large population survey; no individual
     * cut-off. This is not the chronotype-corrected MSFsc and must not be shown as a chronotype.
     * Which days are free comes from the user's work schedule; [isWeekendWakeDay] is only the
     * fallback for a Monday-to-Friday job. Requiring 3 work nights and 2 free nights is a
     * calibration choice.
     */
    fun socialJetlag(
        workMidpoints: List<Double>,
        freeMidpoints: List<Double>,
        minWorkNights: Int = 3,
        minFreeNights: Int = 2,
    ): SocialJetlag? {
        val work = workMidpoints.filter { it.isFinite() }
        val free = freeMidpoints.filter { it.isFinite() }
        if (work.size < maxOf(minWorkNights, 1) || free.size < maxOf(minFreeNights, 1)) return null
        val reference = CircularTime.meanMinuteOfDay(work + free) ?: return null
        val workMean = Stats.mean(unwrap(work, reference))!!
        val freeMean = Stats.mean(unwrap(free, reference))!!
        return SocialJetlag(
            workMidpointMinuteOfDay = ((workMean % DAY) + DAY) % DAY,
            freeMidpointMinuteOfDay = ((freeMean % DAY) + DAY) % DAY,
            signedHours = (freeMean - workMean) / 60.0,
            workNights = work.size,
            freeNights = free.size,
        )
    }

    /**
     * True when a night ended on a Saturday or Sunday. Fallback free-day rule for a
     * Monday-to-Friday schedule; a calibration choice the user's own schedule overrides.
     */
    fun isWeekendWakeDay(wakeEpochDay: Long): Boolean {
        // 1970-01-01 was a Thursday: (epochDay + 3) mod 7 is 0 for Monday … 6 for Sunday.
        return Math.floorMod(wakeEpochDay + 3, 7L) >= 5
    }

    // ------------------------------------------------------------------ SL01 / SL08 duration

    /**
     * SL01. Mean, median, SD and CV of total sleep time over a window, and the number of nights
     * of at least [guidelineMinutes] (7 h for adults: Watson et al. 2015; age ranges in
     * Hirshkowitz et al. 2015). Evidence class A for the guideline, B for the device: wrist
     * trackers agree only moderately with polysomnography and tend to count quiet wakefulness
     * as sleep (de Zambotti et al. 2018; Chinoy et al. 2021).
     *
     * @param tstMinutes one entry per night of the window; null = no night recorded.
     * @param minNights nights required; 5 of 7 is a calibration choice.
     */
    fun durationSummary(
        tstMinutes: List<Double?>,
        guidelineMinutes: Double = GUIDELINE_MINUTES,
        minNights: Int = 5,
    ): SleepDurationSummary? {
        val valid = tstMinutes.filterNotNull().filter { it.isFinite() && it > 0.0 }
        if (valid.size < maxOf(minNights, 1)) return null
        return SleepDurationSummary(
            stats = InterpretationStats.describe(valid) ?: return null,
            guidelineMinutes = guidelineMinutes,
            nightsAtOrAboveGuideline = valid.count { it >= guidelineMinutes },
            missingNights = tstMinutes.size - valid.size,
        )
    }

    /**
     * SL08. Estimated shortfall against a target over a window of nights:
     *
     *   clipped = Σ max(0, target − TST)        signed = Σ (target − TST)
     *
     * Evidence class C. Chronic restriction produces cumulative deficits (Van Dongen et al.
     * 2003: 48 healthy adults, 14 nights in the laboratory), but nothing shows that lost sleep is
     * "repaid" minute for minute, so this is a planning estimate and must be worded "estimated
     * shortfall against your target". The default target is the 7 h guideline minimum
     * (Watson et al. 2015) unless the user set their own.
     *
     * Missing nights are skipped, never counted as zero sleep and never filled with the target.
     * Requiring 5 nights is a calibration choice.
     */
    fun guidelineShortfall(
        tstMinutes: List<Double?>,
        targetMinutes: Double = GUIDELINE_MINUTES,
        minNights: Int = 5,
    ): GuidelineSleepShortfall? {
        require(targetMinutes > 0.0) { "targetMinutes must be > 0" }
        val valid = tstMinutes.filterNotNull().filter { it.isFinite() && it > 0.0 }
        if (valid.size < maxOf(minNights, 1)) return null
        return GuidelineSleepShortfall(
            targetMinutes = targetMinutes,
            clippedMinutes = valid.sumOf { maxOf(0.0, targetMinutes - it) },
            signedMinutes = valid.sumOf { targetMinutes - it },
            validNights = valid.size,
            missingNights = tstMinutes.size - valid.size,
        )
    }

    // ----------------------------------------------------------------------- SL07 continuity

    /**
     * SL07. Wake after sleep onset: minutes scored AWAKE inside the sleep period. Null when the
     * night has no stage data, because "no awake stretches recorded" is then not "no waking".
     * Evidence class B–C: wrist devices measure WASO less well than total sleep time.
     */
    fun wasoMinutes(night: SleepNight, hasStageData: Boolean): Double? {
        if (!hasStageData) return null
        val asleep = asleepSpans(night).sumOf { it.minutes }
        return (night.period.minutes - asleep).toDouble()
    }

    /**
     * SL07. Awakenings per hour of sleep, `awakenings / (minutes asleep / 60)`. Nine awakenings
     * over 6.87 h asleep is 1.31 per hour. A count of the device's own segments, not a clinical
     * fragmentation index; trend only. Null when either input is missing.
     */
    fun awakeningsPerHour(awakenings: Int?, asleepMinutes: Double?): Double? {
        if (awakenings == null || awakenings < 0) return null
        if (asleepMinutes == null || !asleepMinutes.isFinite() || asleepMinutes <= 0.0) return null
        return awakenings / (asleepMinutes / 60.0)
    }
}
