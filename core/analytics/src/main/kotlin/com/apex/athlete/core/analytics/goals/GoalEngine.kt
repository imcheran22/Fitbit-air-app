package com.apex.athlete.core.analytics.goals

import com.apex.athlete.core.analytics.recovery.RecoveryEngine
import java.time.DayOfWeek
import java.time.LocalDate

enum class GoalKind(val isDaily: Boolean) {
    /** Steps per day. */
    DAILY_STEPS(true),
    /** Minutes asleep per day (main sleep plus naps, as the caller defines it). */
    DAILY_SLEEP_MINUTES(true),
    /** Active minutes summed over the week. */
    WEEKLY_ACTIVE_MINUTES(false),
    /** Active Zone Minutes summed over the week. */
    WEEKLY_AZM(false),
    /** Number of days in the week whose recovery score is at least [GoalEngine.RECOVERED_DAY_MIN_SCORE]. The series holds recovery scores. */
    WEEKLY_RECOVERED_DAYS(false),
}

/** A user-chosen target. Apex has no default target for any goal kind. [target] is in the unit of the kind (days for WEEKLY_RECOVERED_DAYS). */
data class GoalSpec(val kind: GoalKind, val target: Double)

/** One calendar day's value. Null (or a day absent from the series) means "not recorded"; 0.0 is a recorded zero. */
data class DayValue(val epochDay: Long, val value: Double?)

/**
 * @property series values by local epoch day, in any order. A negative or non-finite value counts as not recorded.
 *   When a day appears twice the first entry wins. Days after [todayEpochDay] are ignored.
 * @property recoveredDayMinScore only used by WEEKLY_RECOVERED_DAYS.
 */
data class GoalInput(
    val spec: GoalSpec,
    val series: List<DayValue>,
    val todayEpochDay: Long,
    val weekStart: DayOfWeek = DayOfWeek.MONDAY,
    val recoveredDayMinScore: Double = GoalEngine.RECOVERED_DAY_MIN_SCORE,
)

enum class GoalMissingReason {
    /** The target is zero, negative or not finite. */
    INVALID_TARGET,
    /** Daily goal: no recorded value for today. */
    NOT_RECORDED_TODAY,
    /** Weekly goal: no day of the week so far has a recorded value. */
    NO_DATA_THIS_WEEK,
}

/**
 * The calendar week containing today.
 *
 * @property elapsedDays days from the week start to today inclusive.
 * @property daysLeftInclToday days from today to the week end inclusive (today is unfinished, so it can still add).
 * @property recordedDays elapsed days with a recorded value.
 * @property remaining target minus the week-to-date total, never below 0; null when nothing is recorded yet.
 * @property neededPerRemainingDay [remaining] spread evenly over [daysLeftInclToday]; null when there is no total yet.
 * @property totalIsLowerBound true when some elapsed days are not recorded, so the real total may be higher.
 */
data class WeekProgress(
    val weekStartEpochDay: Long,
    val weekEndEpochDay: Long,
    val elapsedDays: Int,
    val daysLeftInclToday: Int,
    val recordedDays: Int,
    val remaining: Double?,
    val neededPerRemainingDay: Double?,
    val totalIsLowerBound: Boolean,
)

/**
 * @property value today's value (daily goals) or the week-to-date total (weekly goals); null when not recorded.
 * @property fraction value / target, not capped at 1.
 * @property achieved value >= target. False when nothing is recorded (not recorded never counts as achieved).
 * @property provisional true while the period is unfinished and the target is not yet met: the number can still change.
 * @property currentStreak / [bestStreak] daily goals only (null for weekly goals and for an invalid target).
 * @property week weekly goals only.
 */
data class GoalProgress(
    val kind: GoalKind,
    val target: Double,
    val value: Double?,
    val fraction: Double?,
    val achieved: Boolean,
    val provisional: Boolean,
    val missingReason: GoalMissingReason?,
    val currentStreak: Int?,
    val bestStreak: Int?,
    val week: WeekProgress?,
)

/**
 * Goal progress, streaks and weekly pace.
 *
 * Rules (all of them are product conventions, not clinical thresholds; none has a validation study):
 *  - A day with no recorded value is "not recorded". It never counts as achieved and is never treated as 0.
 *  - A day is achieved when its value >= target (exactly the target counts).
 *  - Today's value is provisional until the target is met: a partial today neither achieves nor breaks anything.
 *  - Streak (daily goals): the number of consecutive achieved calendar days ending today if today is achieved,
 *    otherwise ending yesterday. An unfinished today therefore does not break a running streak. A day that is not
 *    recorded or below target ends the run. Best streak is the longest such run anywhere in the series (up to today).
 *  - Weekly goals: total of the recorded days from the week start (a configurable weekday) to today. When some days are
 *    not recorded the total is a lower bound and [WeekProgress.totalIsLowerBound] is set.
 *  - Pace: remaining amount spread over the days left including today (today can still add). Already achieved -> 0.
 *  - WEEKLY_RECOVERED_DAYS counts recorded days with a recovery score >= [RECOVERED_DAY_MIN_SCORE].
 */
object GoalEngine {

    /**
     * Recovery score from which a day counts as recovered: the lower edge of the PEAK ("green") band of the recovery engine,
     * reused rather than duplicated. That edge (67) is an Apex calibration choice (see RecoveryEngine), not a clinical cut-off.
     */
    val RECOVERED_DAY_MIN_SCORE: Double = RecoveryEngine.Config().peakThreshold.toDouble()

    fun evaluate(input: GoalInput): GoalProgress {
        val spec = input.spec
        val target = spec.target
        if (!target.isFinite() || target <= 0.0) {
            return GoalProgress(spec.kind, target, null, null, false, false, GoalMissingReason.INVALID_TARGET, null, null, null)
        }
        val today = input.todayEpochDay
        val byDay = HashMap<Long, Double>()
        for (d in input.series) {
            if (d.epochDay > today || d.epochDay in byDay) continue
            val v = d.value
            if (v != null && v.isFinite() && v >= 0.0) byDay[d.epochDay] = v
        }
        return if (spec.kind.isDaily) daily(spec, byDay, today) else weekly(input, byDay)
    }

    private fun daily(spec: GoalSpec, byDay: Map<Long, Double>, today: Long): GoalProgress {
        val target = spec.target
        val value = byDay[today]
        val achieved = value != null && value >= target
        // Current streak: from today if achieved, else from yesterday.
        var cursor = if (achieved) today else today - 1
        var current = 0
        while (byDay[cursor]?.let { it >= target } == true) { current++; cursor-- }
        // Best streak: longest run of consecutive achieved days.
        var best = 0
        var run = 0
        var prev = Long.MIN_VALUE
        for (day in byDay.filterValues { it >= target }.keys.sorted()) {
            run = if (day == prev + 1) run + 1 else 1
            prev = day
            if (run > best) best = run
        }
        return GoalProgress(
            kind = spec.kind, target = target, value = value,
            fraction = value?.div(target),
            achieved = achieved, provisional = !achieved,
            missingReason = if (value == null) GoalMissingReason.NOT_RECORDED_TODAY else null,
            currentStreak = current, bestStreak = best, week = null,
        )
    }

    private fun weekly(input: GoalInput, byDay: Map<Long, Double>): GoalProgress {
        val spec = input.spec
        val target = spec.target
        val today = input.todayEpochDay
        val dow = LocalDate.ofEpochDay(today).dayOfWeek
        val daysIntoWeek = Math.floorMod(dow.value - input.weekStart.value, 7)
        val weekStart = today - daysIntoWeek
        val elapsed = daysIntoWeek + 1
        val left = 7 - daysIntoWeek
        val weekValues = (weekStart..today).mapNotNull { byDay[it] }
        val total: Double? = if (weekValues.isEmpty()) null else when (spec.kind) {
            GoalKind.WEEKLY_RECOVERED_DAYS -> weekValues.count { it >= input.recoveredDayMinScore }.toDouble()
            else -> weekValues.sum()
        }
        val achieved = total != null && total >= target
        val remaining = total?.let { (target - it).coerceAtLeast(0.0) }
        val week = WeekProgress(
            weekStartEpochDay = weekStart, weekEndEpochDay = weekStart + 6,
            elapsedDays = elapsed, daysLeftInclToday = left, recordedDays = weekValues.size,
            remaining = remaining,
            neededPerRemainingDay = remaining?.div(left),
            totalIsLowerBound = weekValues.size < elapsed,
        )
        return GoalProgress(
            kind = spec.kind, target = target, value = total, fraction = total?.div(target),
            achieved = achieved, provisional = !achieved,
            missingReason = if (total == null) GoalMissingReason.NO_DATA_THIS_WEEK else null,
            currentStreak = null, bestStreak = null, week = week,
        )
    }

    /** Whether one recorded daily value meets a daily-goal target (shared with the report engine). */
    internal fun valueMeetsTarget(value: Double, target: Double): Boolean = value.isFinite() && target.isFinite() && target > 0.0 && value >= target
}
