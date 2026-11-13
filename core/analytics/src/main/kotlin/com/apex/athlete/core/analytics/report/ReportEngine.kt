package com.apex.athlete.core.analytics.report

import com.apex.athlete.core.analytics.goals.DayValue
import com.apex.athlete.core.analytics.goals.GoalEngine
import com.apex.athlete.core.analytics.goals.GoalKind
import com.apex.athlete.core.analytics.goals.GoalSpec
import com.apex.athlete.core.analytics.journal.JournalEffect
import com.apex.athlete.core.analytics.load.WorkloadZone
import java.time.LocalDate

enum class ReportPeriodType { WEEK, MONTH }

/**
 * One day of the daily series. Every field except [epochDay] is nullable: null = not recorded.
 * [workoutCount] 0 is a recorded "no workout"; null is unknown.
 */
data class ReportDay(
    val epochDay: Long,
    val recovery: Double?,
    val sleepScore: Double?,
    val strain: Double?,
    val hrvMs: Double?,
    val restingHr: Double?,
    val workoutCount: Int?,
    val loadZone: WorkloadZone?,
    val loadCalibrating: Boolean = false,
)

/** A goal and the series it is measured on (steps per day, sleep minutes, active minutes, AZM, or recovery scores). */
data class ReportGoalInput(val spec: GoalSpec, val series: List<DayValue>)

/**
 * @property startEpochDay first day of the period (first day of the week or month: chosen by the caller).
 * @property days the daily series; days outside the period and the previous period of equal length are ignored. The first entry for a day wins.
 * @property behaviourEffects already ranked and computed elsewhere (JournalEffects); carried in order and capped at 3.
 * @property asOfEpochDay for a period still in progress: only days up to and including it are used and counted.
 */
data class ReportRequest(
    val type: ReportPeriodType,
    val startEpochDay: Long,
    val days: List<ReportDay>,
    val goals: List<ReportGoalInput> = emptyList(),
    val behaviourEffects: List<JournalEffect> = emptyList(),
    val asOfEpochDay: Long? = null,
)

enum class ChangeMissingReason { INSUFFICIENT_CURRENT, INSUFFICIENT_PREVIOUS, INSUFFICIENT_BOTH }

/**
 * @property mean mean of the recorded days; null when none is recorded.
 * @property change [mean] minus [previousMean] in the metric's own unit; null unless both periods have at least 4 recorded days.
 * @property best / [worst] highest and lowest recorded day (ties: the earlier day). Only filled for recovery and sleep.
 */
data class MetricSummary(
    val recordedDays: Int,
    val mean: Double?,
    val previousRecordedDays: Int,
    val previousMean: Double?,
    val change: Double?,
    val changeMissingReason: ChangeMissingReason?,
    val best: DayValue?,
    val worst: DayValue?,
)

enum class LoadAtEndMissingReason { NOT_RECORDED, CALIBRATING }
data class LoadAtEnd(val zone: WorkloadZone?, val reason: LoadAtEndMissingReason?)

enum class GoalAchievementMissingReason { NO_DATA_IN_PERIOD, WEEKLY_GOAL_NOT_SUMMARISED_FOR_MONTH }

/**
 * Daily goal: [achievedCount] days achieved out of [outOf] days in the period ([recordedDays] of them had a value).
 * Weekly goal in a WEEK report: 1 or 0 achieved out of 1. Null with a [missingReason] when it cannot be summarised.
 */
data class GoalAchievement(
    val kind: GoalKind,
    val target: Double,
    val achievedCount: Int?,
    val outOf: Int,
    val recordedDays: Int,
    val missingReason: GoalAchievementMissingReason?,
)

data class PeriodReport(
    val type: ReportPeriodType,
    val startEpochDay: Long,
    /** Last day of the period as defined by the calendar, even when [partial]. */
    val endEpochDay: Long,
    /** Days counted: the whole period, or only the days up to the as-of day when [partial]. */
    val daysInPeriod: Int,
    val partial: Boolean,
    val recovery: MetricSummary,
    val sleep: MetricSummary,
    val strain: MetricSummary,
    val hrv: MetricSummary,
    val restingHr: MetricSummary,
    /** Sum of the recorded workout counts; null when no day has a recorded count. */
    val totalWorkouts: Int?,
    val workoutDaysWithStrain: Int,
    val meanStrainOnWorkoutDays: Double?,
    val loadAtEnd: LoadAtEnd,
    val goals: List<GoalAchievement>,
    val behaviourEffects: List<JournalEffect>,
    val coverageDays: Int,
    /** Days with at least one of recovery, sleep or strain recorded, divided by [daysInPeriod]. */
    val coverage: Double,
    /** Coverage below 50 %: the means and changes describe few days and should be shown as such. */
    val sparse: Boolean,
)

/**
 * Week or month summary of the daily series.
 *
 * Rules (Apex conventions, none validated by a study):
 *  - Period: WEEK = 7 days from the start day; MONTH = from the start day to the day before the same date next month
 *    (calendar length). The previous period has the same number of days and ends the day before the start.
 *  - Mean of a metric over its recorded days only; a missing day is neither 0 nor filled.
 *  - Change = mean minus the previous period's mean, only when both periods have at least [MIN_DAYS_FOR_CHANGE] = 4 recorded
 *    days of that metric. Four is a calibration choice (a mean of fewer days is dominated by one night).
 *  - Best and worst day for recovery and sleep.
 *  - Workouts: total of recorded counts; strain on workout days = mean strain of days with at least one workout and a recorded strain.
 *  - Load status: the zone recorded on the last day of the period only; an earlier day's zone is never carried forward.
 *  - Goals: daily goals count achieved days; weekly goals are scored over the 7 days of a WEEK report and are not summarised for a MONTH.
 *  - Coverage and SPARSE: coverage < [SPARSE_BELOW] = 0.5 (calibration choice) sets SPARSE. When [ReportRequest.asOfEpochDay] ends the
 *    period early, coverage is measured against the elapsed days so an unfinished week is not called sparse for days that have not happened.
 *  - Behaviour effects are associations from the journal engine, carried unchanged and capped at 3.
 */
object ReportEngine {
    const val MIN_DAYS_FOR_CHANGE: Int = 4
    const val SPARSE_BELOW: Double = 0.5
    const val MAX_BEHAVIOUR_EFFECTS: Int = 3

    fun periodLengthDays(type: ReportPeriodType, startEpochDay: Long): Int = when (type) {
        ReportPeriodType.WEEK -> 7
        ReportPeriodType.MONTH -> {
            val start = LocalDate.ofEpochDay(startEpochDay)
            (start.plusMonths(1).toEpochDay() - startEpochDay).toInt()
        }
    }

    fun summarise(request: ReportRequest): PeriodReport {
        val start = request.startEpochDay
        val length = periodLengthDays(request.type, start)
        val end = start + length - 1
        val lastCounted = request.asOfEpochDay?.let { minOf(it, end) } ?: end
        val elapsed = (lastCounted - start + 1).toInt().coerceIn(0, length)
        val partial = elapsed < length
        val prevStart = start - length

        val byDay = HashMap<Long, ReportDay>()
        for (d in request.days) byDay.putIfAbsent(d.epochDay, d)
        val current = (start..lastCounted).mapNotNull { byDay[it] }
        val previous = (prevStart until start).mapNotNull { byDay[it] }

        fun metric(pick: (ReportDay) -> Double?, withExtremes: Boolean): MetricSummary {
            fun recorded(list: List<ReportDay>) = list.mapNotNull { d -> pick(d)?.takeIf(Double::isFinite)?.let { DayValue(d.epochDay, it) } }
            val cur = recorded(current)
            val prev = recorded(previous)
            val mean = cur.takeIf { it.isNotEmpty() }?.map { it.value!! }?.average()
            val prevMean = prev.takeIf { it.isNotEmpty() }?.map { it.value!! }?.average()
            val curOk = cur.size >= MIN_DAYS_FOR_CHANGE
            val prevOk = prev.size >= MIN_DAYS_FOR_CHANGE
            val reason = when {
                curOk && prevOk -> null
                !curOk && !prevOk -> ChangeMissingReason.INSUFFICIENT_BOTH
                !curOk -> ChangeMissingReason.INSUFFICIENT_CURRENT
                else -> ChangeMissingReason.INSUFFICIENT_PREVIOUS
            }
            return MetricSummary(
                recordedDays = cur.size, mean = mean,
                previousRecordedDays = prev.size, previousMean = prevMean,
                change = if (reason == null) mean!! - prevMean!! else null,
                changeMissingReason = reason,
                best = if (withExtremes) cur.minWithOrNull(compareByDescending<DayValue> { it.value }.thenBy { it.epochDay }) else null,
                worst = if (withExtremes) cur.minWithOrNull(compareBy<DayValue> { it.value }.thenBy { it.epochDay }) else null,
            )
        }

        val counts = current.mapNotNull { it.workoutCount?.takeIf { c -> c >= 0 } }
        val workoutStrains = current.filter { (it.workoutCount ?: 0) > 0 }.mapNotNull { it.strain?.takeIf(Double::isFinite) }

        val lastDay = byDay[lastCounted]
        val loadAtEnd = when {
            lastDay?.loadZone != null -> LoadAtEnd(lastDay.loadZone, null)
            lastDay?.loadCalibrating == true -> LoadAtEnd(null, LoadAtEndMissingReason.CALIBRATING)
            else -> LoadAtEnd(null, LoadAtEndMissingReason.NOT_RECORDED)
        }

        val coverageDays = current.count { listOf(it.recovery, it.sleepScore, it.strain).any { v -> v != null && v.isFinite() } }
        val coverage = if (elapsed == 0) 0.0 else coverageDays.toDouble() / elapsed

        return PeriodReport(
            type = request.type, startEpochDay = start, endEpochDay = end, daysInPeriod = elapsed, partial = partial,
            recovery = metric({ it.recovery }, true),
            sleep = metric({ it.sleepScore }, true),
            strain = metric({ it.strain }, false),
            hrv = metric({ it.hrvMs }, false),
            restingHr = metric({ it.restingHr }, false),
            totalWorkouts = counts.takeIf { it.isNotEmpty() }?.sum(),
            workoutDaysWithStrain = workoutStrains.size,
            meanStrainOnWorkoutDays = workoutStrains.takeIf { it.isNotEmpty() }?.average(),
            loadAtEnd = loadAtEnd,
            goals = request.goals.map { goalAchievement(it, request.type, start, lastCounted, elapsed) },
            behaviourEffects = request.behaviourEffects.take(MAX_BEHAVIOUR_EFFECTS),
            coverageDays = coverageDays, coverage = coverage, sparse = coverage < SPARSE_BELOW,
        )
    }

    private fun goalAchievement(g: ReportGoalInput, type: ReportPeriodType, start: Long, last: Long, elapsed: Int): GoalAchievement {
        val kind = g.spec.kind
        val target = g.spec.target
        fun missing(reason: GoalAchievementMissingReason, outOf: Int) = GoalAchievement(kind, target, null, outOf, 0, reason)
        val values = LinkedHashMap<Long, Double>()
        for (d in g.series) {
            val v = d.value
            if (d.epochDay in start..last && d.epochDay !in values && v != null && v.isFinite() && v >= 0.0) values[d.epochDay] = v
        }
        if (kind.isDaily) {
            if (values.isEmpty()) return missing(GoalAchievementMissingReason.NO_DATA_IN_PERIOD, elapsed)
            return GoalAchievement(kind, target, values.values.count { GoalEngine.valueMeetsTarget(it, target) }, elapsed, values.size, null)
        }
        if (type == ReportPeriodType.MONTH) return missing(GoalAchievementMissingReason.WEEKLY_GOAL_NOT_SUMMARISED_FOR_MONTH, 1)
        if (values.isEmpty()) return missing(GoalAchievementMissingReason.NO_DATA_IN_PERIOD, 1)
        val total = if (kind == GoalKind.WEEKLY_RECOVERED_DAYS) {
            values.values.count { it >= GoalEngine.RECOVERED_DAY_MIN_SCORE }.toDouble()
        } else values.values.sum()
        return GoalAchievement(kind, target, if (GoalEngine.valueMeetsTarget(total, target)) 1 else 0, 1, values.size, null)
    }
}
