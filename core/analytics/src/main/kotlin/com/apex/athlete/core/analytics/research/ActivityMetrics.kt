package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.baseline.DailyValue
import kotlin.math.ln

/**
 * PA02. A week of moderate-to-vigorous activity against the WHO 2020 guideline.
 *
 * @property moderateEquivalentMinutes moderate + 2 · vigorous.
 * @property percentOfLowerBound 100 · moderate-equivalent / 150. Progress towards a goal, not a
 *   clinical measure.
 * @property validDays days of the week that had activity data.
 * @property isLowerBound true when some days are missing: the real total can only be higher.
 */
data class WeeklyActivity(
    val moderateEquivalentMinutes: Double,
    val moderateMinutes: Double?,
    val vigorousMinutes: Double?,
    val percentOfLowerBound: Double,
    val meetsLowerBound: Boolean,
    val meetsUpperBound: Boolean,
    val minutesToLowerBound: Double,
    val validDays: Int,
    val isLowerBound: Boolean,
)

/**
 * PA10. Weeks in a row that reached the guideline's lower bound.
 *
 * @property currentStreakWeeks consecutive weeks, counted back from the latest, that met it.
 *   A week without enough data ends the count; it is not assumed to have met or missed it.
 * @property weeksUnknown weeks that could not be judged.
 */
data class GuidelineStreak(
    val currentStreakWeeks: Int,
    val weeksMeeting: Int,
    val weeksEvaluated: Int,
    val weeksUnknown: Int,
)

/**
 * PA03. Sedentary bouts of a day or of a list of intervals.
 *
 * @property prolongedBouts the bouts of at least [thresholdMinutes], in the order given.
 * @property longestMinutes longest bout of any length; null when there is none.
 * @property prolongedMinutes minutes inside the prolonged bouts.
 * @property totalMinutes minutes in all bouts, short ones included.
 */
data class SedentaryBouts(
    val thresholdMinutes: Double,
    val prolongedBouts: List<Double>,
    val longestMinutes: Double?,
    val prolongedMinutes: Double,
    val totalMinutes: Double,
) {
    val prolongedCount: Int get() = prolongedBouts.size
}

/**
 * PA03 / PA04 derived from one-minute step counts.
 *
 * @property observedWakingMinutes minutes that had data and were not asleep.
 * @property breaks times a sedentary stretch was ended by a minute of movement.
 * @property breaksPerSedentaryHour PA04. Null when no sedentary minute was observed.
 */
data class SedentaryDay(
    val bouts: SedentaryBouts,
    val observedWakingMinutes: Int,
    val breaks: Int,
    val breaksPerSedentaryHour: Double?,
    val breaksPerWakingHour: Double,
)

/**
 * PA07. Where in the day the steps fell.
 *
 * @property hourlySteps steps per clock hour; null for an hour without any observed minute.
 * @property activeHours hours with at least one step.
 * @property normalisedEntropy 0 = all steps in one hour, 1 = spread evenly over the observed
 *   hours. Null when fewer than two hours were observed or no step was taken.
 */
data class HourlyStepProfile(
    val hourlySteps: List<Int?>,
    val activeHours: Int,
    val stepsPerActiveHour: Double?,
    val normalisedEntropy: Double?,
)

/**
 * BV02 / PA06. How often a daily target was met.
 *
 * @property currentStreakDays consecutive days, counted back from the last, that met the
 *   target. A day without data ends the count.
 */
data class TargetAdherence(
    val daysMeeting: Int,
    val validDays: Int,
    val percentOfValidDays: Double,
    val currentStreakDays: Int,
)

/** Daily-step range at which the pooled mortality curve levels off, by age group. */
data class StepReferenceRange(val lowSteps: Int, val highSteps: Int)

object ActivityMetrics {

    /** WHO 2020 (Bull et al. 2020): 150–300 min of moderate aerobic activity per week. */
    const val WHO_LOWER_BOUND_MINUTES = 150.0
    const val WHO_UPPER_BOUND_MINUTES = 300.0

    /** One vigorous minute counts as two moderate minutes (75–150 vigorous ≡ 150–300 moderate). */
    const val VIGOROUS_WEIGHT = 2.0

    private const val WEEK = 7

    // ---------------------------------------------------------------------------- PA01 steps

    /**
     * PA01 / PA06. Median, mean, SD and CV of daily steps over the [windowDays] days ending on
     * [asOfDay]. Pass the last complete day: a day still in progress would look like a low day.
     *
     * Evidence class A for the association of steps with mortality (Paluch et al. 2022,
     * 15 cohorts, 47,471 adults), B for the device (wrist step counts are accurate for walking,
     * less so for other movement: Feehan et al. 2018). The CV as "regularity" is class C.
     * Requiring 5 of 7 days is a calibration choice. For the trend use
     * [Longitudinal.weeklyTrend]; for "unusual for this weekday" use
     * [RobustBaseline.sameWeekdayDeviation].
     */
    fun stepsSummary(
        history: List<DailyValue>,
        asOfDay: Long,
        windowDays: Int = WEEK,
        minValidDays: Int = 5,
    ): DescriptiveSummary? {
        val values = history.windowValues(asOfDay - windowDays + 1, asOfDay + 1).filter { it >= 0.0 }
        if (values.size < maxOf(minValidDays, 1)) return null
        return InterpretationStats.describe(values)
    }

    /**
     * Population reference from Paluch et al. 2022 (Lancet Public Health): mortality risk fell
     * with more daily steps and levelled off around 6,000–8,000 for adults of 60 and over and
     * 8,000–10,000 below 60. A pattern across groups; it is not a personal target and says
     * nothing about cause.
     */
    fun stepReferenceRange(ageYears: Int): StepReferenceRange =
        if (ageYears >= 60) StepReferenceRange(6_000, 8_000) else StepReferenceRange(8_000, 10_000)

    /** Steps per waking hour (class C descriptor). Null when the waking time is unknown. */
    fun stepsPerWakingHour(steps: Double?, wakingMinutes: Double?): Double? {
        if (steps == null || wakingMinutes == null) return null
        if (!steps.isFinite() || steps < 0.0 || !wakingMinutes.isFinite() || wakingMinutes <= 0.0) return null
        return steps / (wakingMinutes / 60.0)
    }

    // ----------------------------------------------------------------------------- PA02 MVPA

    /**
     * PA02. Weekly moderate-to-vigorous minutes against the WHO 2020 guideline (Bull et al.
     * 2020; Piercy et al. 2018):
     *
     *   moderate-equivalent = moderate + 2 · vigorous      guideline: 150–300 per week
     *
     * Evidence class A for the guideline, B for the device's intensity classification. A day
     * counts only when both of its values exist. With fewer than [minValidDays] valid days the
     * result is null; with 5 or 6 the total is flagged as a lower bound, because the missing
     * days are not assumed to be inactive. The 5-day minimum is a calibration choice.
     *
     * @param weekEndDay last day of the 7-day window.
     */
    fun weeklyMvpa(
        moderate: List<DailyValue>,
        vigorous: List<DailyValue>,
        weekEndDay: Long,
        minValidDays: Int = 5,
    ): WeeklyActivity? {
        val from = weekEndDay - WEEK + 1
        val mod = moderate.window(from, weekEndDay + 1).associateBy({ it.epochDay }, { it.value })
        val vig = vigorous.window(from, weekEndDay + 1).associateBy({ it.epochDay }, { it.value })
        val days = mod.keys.intersect(vig.keys).filter { mod.getValue(it) >= 0.0 && vig.getValue(it) >= 0.0 }
        if (days.size < maxOf(minValidDays, 1)) return null
        val m = days.sumOf { mod.getValue(it) }
        val v = days.sumOf { vig.getValue(it) }
        return weekly(m + VIGOROUS_WEIGHT * v, m, v, days.size)
    }

    /**
     * PA02 from Active Zone Minutes, which already count cardio and peak minutes twice and so
     * are moderate-equivalent minutes by construction. 128 of 150 is 85.3 %. The device's
     * "active minutes" and Active Zone Minutes are defined differently and must stay labelled.
     */
    fun weeklyActiveZoneMinutes(
        activeZoneMinutes: List<DailyValue>,
        weekEndDay: Long,
        minValidDays: Int = 5,
    ): WeeklyActivity? {
        val values = activeZoneMinutes.windowValues(weekEndDay - WEEK + 1, weekEndDay + 1).filter { it >= 0.0 }
        if (values.size < maxOf(minValidDays, 1)) return null
        return weekly(values.sum(), null, null, values.size)
    }

    private fun weekly(equivalent: Double, moderate: Double?, vigorous: Double?, validDays: Int) = WeeklyActivity(
        moderateEquivalentMinutes = equivalent,
        moderateMinutes = moderate,
        vigorousMinutes = vigorous,
        percentOfLowerBound = 100.0 * equivalent / WHO_LOWER_BOUND_MINUTES,
        meetsLowerBound = equivalent >= WHO_LOWER_BOUND_MINUTES,
        meetsUpperBound = equivalent >= WHO_UPPER_BOUND_MINUTES,
        minutesToLowerBound = (WHO_LOWER_BOUND_MINUTES - equivalent).coerceAtLeast(0.0),
        validDays = validDays,
        isLowerBound = validDays < WEEK,
    )

    /**
     * PA10. Consecutive weeks that reached 150 moderate-equivalent minutes (WHO 2020).
     * Descriptive only.
     *
     * A week reached the guideline when its total is at least 150, even if some days are
     * missing (the total is a lower bound). A week with missing days and a total below 150, or
     * with no result at all, is unknown and ends the streak without being counted as a miss.
     *
     * @param weeks one entry per week, oldest first; null = that week could not be computed.
     */
    fun guidelineStreak(weeks: List<WeeklyActivity?>): GuidelineStreak {
        fun judged(w: WeeklyActivity?): Boolean? = when {
            w == null -> null
            w.meetsLowerBound -> true
            w.isLowerBound -> null
            else -> false
        }
        val verdicts = weeks.map(::judged)
        return GuidelineStreak(
            currentStreakWeeks = verdicts.asReversed().takeWhile { it == true }.size,
            weeksMeeting = verdicts.count { it == true },
            weeksEvaluated = verdicts.count { it != null },
            weeksUnknown = verdicts.count { it == null },
        )
    }

    // ------------------------------------------------------------------------ PA03 sedentary

    /**
     * PA03. Prolonged sedentary bouts from a list of bout lengths (the provider's
     * `sedentary-period` intervals, or the bouts found by [sedentaryDay]). Bouts
     * `[45, 120, 20, 65, 35, 15]` give 4 bouts of 30 min or more, longest 120, total 300.
     *
     * Evidence class B: long uninterrupted sedentary time is associated with mortality
     * independently of activity (Diaz et al. 2017; Ekelund et al. 2016; Patterson et al. 2018).
     * The 30-minute threshold is a calibration choice, not a medical limit; no number of
     * sedentary hours may be called safe or unsafe. The device detects inactivity at the wrist,
     * not sitting.
     */
    fun prolongedBouts(boutMinutes: List<Double>, thresholdMinutes: Double = 30.0): SedentaryBouts {
        require(thresholdMinutes > 0.0) { "thresholdMinutes must be > 0" }
        val valid = boutMinutes.filter { it.isFinite() && it > 0.0 }
        val prolonged = valid.filter { it >= thresholdMinutes }
        return SedentaryBouts(
            thresholdMinutes = thresholdMinutes,
            prolongedBouts = prolonged,
            longestMinutes = valid.maxOrNull(),
            prolongedMinutes = prolonged.sum(),
            totalMinutes = valid.sum(),
        )
    }

    /**
     * PA03(b) and PA04. Sedentary bouts and breaks from the one-minute step series of a day.
     *
     * A minute is sedentary when it has data, is not asleep and has fewer than
     * [breakStepsPerMinute] steps. A bout is a run of sedentary minutes. It ends with a break
     * (a minute of at least [breakStepsPerMinute] steps), with sleep, or with a minute without
     * data; only the first counts as a break. A minute without data is unknown, so it neither
     * extends a bout nor counts as movement.
     *
     *   breaks per sedentary hour = breaks / (sedentary minutes / 60)
     *
     * Breaks in sedentary time were associated with better metabolic markers in Healy et al.
     * 2008 (168 adults, hip accelerometer). Evidence class B. The 20 steps/min break rule and
     * the 30-minute bout threshold are calibration choices; the research names both as tunable.
     *
     * @param minuteSteps steps for each minute of the civil day (index = minute after
     *   midnight); null = the band was not worn or the minute has not synced. A worn minute
     *   without steps must be 0, not null.
     * @param asleepMinutes minute-of-day ranges spent asleep, excluded from the analysis.
     * @param minObservedWakingMinutes below this the day is too thinly covered and the result
     *   is null. 600 min (10 h) is the usual valid-day convention; a calibration choice here.
     */
    fun sedentaryDay(
        minuteSteps: List<Int?>,
        asleepMinutes: List<IntRange> = emptyList(),
        breakStepsPerMinute: Int = 20,
        prolongedThresholdMinutes: Double = 30.0,
        minObservedWakingMinutes: Int = 600,
    ): SedentaryDay? {
        require(breakStepsPerMinute >= 1) { "breakStepsPerMinute must be >= 1" }
        val bouts = ArrayList<Double>()
        var run = 0
        var breaks = 0
        var observed = 0
        fun close() {
            if (run > 0) bouts += run.toDouble()
            run = 0
        }
        for ((minute, steps) in minuteSteps.withIndex()) {
            if (steps == null || steps < 0 || asleepMinutes.any { minute in it }) {
                close()
                continue
            }
            observed++
            if (steps < breakStepsPerMinute) {
                run++
            } else {
                if (run > 0) breaks++
                close()
            }
        }
        close()
        if (observed < minObservedWakingMinutes) return null
        val summary = prolongedBouts(bouts, prolongedThresholdMinutes)
        return SedentaryDay(
            bouts = summary,
            observedWakingMinutes = observed,
            breaks = breaks,
            breaksPerSedentaryHour = if (summary.totalMinutes > 0.0) breaks / (summary.totalMinutes / 60.0) else null,
            breaksPerWakingHour = breaks / (observed / 60.0),
        )
    }

    // --------------------------------------------------------------------- PA05 peak cadence

    /**
     * PA05. Peak cadence: the mean of the [topMinutes] highest one-minute step counts of a day
     * (30 or 60; the minutes need not be consecutive). Higher peak cadence went with lower
     * mortality in Paluch et al. 2022, but the paper found no definitive association of step
     * intensity beyond the total number of steps. Evidence class B for the measure, C for any
     * claim that pace matters on top of volume; a description of how briskly the person moved
     * at best, with no threshold.
     *
     * Null when fewer than [minObservedMinutes] minutes have data: the peak of a thinly covered
     * day is not the day's peak. 600 min is a calibration choice.
     */
    fun peakCadence(minuteSteps: List<Int?>, topMinutes: Int = 30, minObservedMinutes: Int = 600): Double? {
        require(topMinutes >= 1) { "topMinutes must be >= 1" }
        val observed = minuteSteps.filterNotNull().filter { it >= 0 }
        if (observed.size < maxOf(minObservedMinutes, topMinutes)) return null
        return observed.sortedDescending().take(topMinutes).average()
    }

    // -------------------------------------------------------------------- PA07 hourly profile

    /**
     * PA07. Steps per clock hour and how evenly they are spread:
     * `H* = −Σ p_h · ln p_h / ln n`, with p_h the share of the day's steps in hour h and n the
     * number of observed hours. Evidence class C; descriptive.
     */
    fun hourlyStepProfile(minuteSteps: List<Int?>): HourlyStepProfile {
        val hourly: List<Int?> = minuteSteps.chunked(60).map { hour ->
            val observed = hour.filterNotNull().filter { it >= 0 }
            if (observed.isEmpty()) null else observed.sum()
        }
        val observedHours = hourly.filterNotNull()
        val total = observedHours.sum()
        val active = observedHours.count { it > 0 }
        val entropy = if (observedHours.size >= 2 && total > 0) {
            -observedHours.filter { it > 0 }.sumOf { val p = it.toDouble() / total; p * ln(p) } / ln(observedHours.size.toDouble())
        } else null
        return HourlyStepProfile(
            hourlySteps = hourly,
            activeHours = active,
            stepsPerActiveHour = if (active > 0) total.toDouble() / active else null,
            normalisedEntropy = entropy,
        )
    }

    // --------------------------------------------------------------- BV02 adherence / streak

    /**
     * BV02. Share of valid days that met a user-set target, and the current run of such days.
     * The target is the user's own (or a cited guideline); 10,000 steps is not a medical
     * requirement and must not be the silent default. Days without data are left out of the
     * percentage and end a streak.
     *
     * @param values one entry per day, oldest first; null = no data.
     * @param atLeast true when meeting the target means reaching it, false when staying at or
     *   below it (for example prolonged sedentary bouts).
     */
    fun targetAdherence(values: List<Double?>, target: Double, atLeast: Boolean = true): TargetAdherence? {
        fun met(v: Double?): Boolean? = when {
            v == null || !v.isFinite() -> null
            atLeast -> v >= target
            else -> v <= target
        }
        val verdicts = values.map(::met)
        val valid = verdicts.count { it != null }
        if (valid == 0) return null
        val meeting = verdicts.count { it == true }
        return TargetAdherence(
            daysMeeting = meeting,
            validDays = valid,
            percentOfValidDays = 100.0 * meeting / valid,
            currentStreakDays = verdicts.asReversed().takeWhile { it == true }.size,
        )
    }
}
