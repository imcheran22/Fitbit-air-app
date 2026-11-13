package com.apex.athlete.ui.reports

import com.apex.athlete.core.analytics.goals.GoalSpec
import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.analytics.report.ChangeMissingReason
import com.apex.athlete.core.analytics.report.GoalAchievement
import com.apex.athlete.core.analytics.report.LoadAtEnd
import com.apex.athlete.core.analytics.report.MetricSummary
import com.apex.athlete.core.analytics.report.PeriodReport
import com.apex.athlete.core.analytics.report.ReportDay
import com.apex.athlete.core.analytics.report.ReportGoalInput
import com.apex.athlete.core.analytics.report.ReportPeriodType
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.goals.SeriesSource
import com.apex.athlete.ui.goals.seriesFor
import com.apex.athlete.ui.goals.toEngine
import java.time.LocalDate

/** History behind the reports: 12 weeks or 6 months, plus the equal-length period before the oldest one for "change". */
const val REPORT_HISTORY_DAYS = 230
const val WEEKS_LISTED = 12
const val MONTHS_LISTED = 6

/** Start days of the periods, newest (the current, unfinished one) first. Weeks start on Monday; months on the 1st. */
fun periodStarts(type: ReportPeriodType, today: Long, count: Int): List<Long> = when (type) {
    ReportPeriodType.WEEK -> {
        val monday = today - (LocalDate.ofEpochDay(today).dayOfWeek.value - 1)
        (0 until count).map { monday - 7L * it }
    }
    ReportPeriodType.MONTH -> {
        val first = LocalDate.ofEpochDay(today).withDayOfMonth(1)
        (0 until count).map { first.minusMonths(it.toLong()).toEpochDay() }
    }
}

/** Everything the reports need from the repository, already joined by day. */
data class ReportSource(
    val days: List<ReportDay>,
    val goals: List<ReportGoalInput>,
    val provenance: Map<MetricType, DataProvenance?>,
    /** Provenance of the logged workouts (the first record's when sources are mixed); null without any. */
    val workoutProvenance: DataProvenance?,
    val isDemo: Boolean,
)

/** A logged workout reduced to what the report needs. */
data class WorkoutRef(val epochDay: Long, val provenance: DataProvenance)

/**
 * Joins the stored daily series into [ReportDay]s. A metric with no stored value on a day stays null (not recorded).
 * Workout count is the number of logged workouts that day when there is at least one, otherwise null: Apex does not claim
 * "no workout" for a day it has no workout record for, so the total is labelled as logged workouts.
 */
fun buildReportSource(trends: TrendIntelligenceState, workouts: List<WorkoutRef>, goals: List<GoalEntity>): ReportSource {
    val byMetric = trends.trends.associateBy { it.metric }
    fun valueMap(metric: MetricType): Map<Long, Double?> = byMetric[metric]?.points?.associate { it.epochDay to it.value }.orEmpty()
    val recovery = valueMap(MetricType.RECOVERY_SCORE)
    val sleep = valueMap(MetricType.SLEEP_SCORE)
    val strain = valueMap(MetricType.STRAIN_SCORE)
    val hrv = valueMap(MetricType.HRV_RMSSD)
    val rhr = valueMap(MetricType.RESTING_HEART_RATE)
    val workoutCounts = workouts.groupingBy { it.epochDay }.eachCount()
    val allDays = (recovery.keys + sleep.keys + strain.keys + hrv.keys + rhr.keys + workoutCounts.keys).toSortedSet()
    val days = allDays.map { d ->
        ReportDay(
            epochDay = d, recovery = recovery[d], sleepScore = sleep[d], strain = strain[d], hrvMs = hrv[d], restingHr = rhr[d],
            workoutCount = workoutCounts[d], loadZone = null,
        )
    }
    val sources = trends.trends.associate { it.metric to SeriesSource(it.points, it.provenance) }
    val goalInputs = goals.filter { it.enabled && it.target > 0.0 }.map {
        ReportGoalInput(GoalSpec(it.kind.toEngine(), it.target), seriesFor(it.kind, sources))
    }
    return ReportSource(days, goalInputs, trends.trends.associate { it.metric to it.provenance }, workouts.firstOrNull()?.provenance, trends.isDemo)
}

/** Puts the load zone recorded on the period's last counted day onto that day (the engine reads that day only). */
fun withLoadOnDay(days: List<ReportDay>, day: Long, zone: WorkloadZone?, calibrating: Boolean): List<ReportDay> {
    if (zone == null && !calibrating) return days
    val existing = days.firstOrNull { it.epochDay == day }
    val updated = existing?.copy(loadZone = zone, loadCalibrating = calibrating)
        ?: ReportDay(day, null, null, null, null, null, null, zone, calibrating)
    return days.filter { it.epochDay != day } + updated
}

/** Last day the report counts: the period end, or today for the period in progress. */
fun lastCountedDay(report: PeriodReport): Long = report.startEpochDay + report.daysInPeriod - 1

// --- UI models ---------------------------------------------------------------------------------------

/** One row of the report list. */
data class ReportItemUi(
    val type: ReportPeriodType,
    val startEpochDay: Long,
    val endEpochDay: Long,
    val partial: Boolean,
    val daysInPeriod: Int,
    val coverageDays: Int,
    val sparse: Boolean,
    val recovery: MetricState,
    val sleep: MetricState,
)

enum class ReportMetric { RECOVERY, SLEEP, STRAIN, HRV, RESTING_HR }

sealed interface ChangeUi {
    /** [delta] is this period's mean minus the previous period's, in the metric's own unit. */
    data class Delta(val delta: Double, val decimals: Int) : ChangeUi
    data class Missing(val reason: ChangeMissingReason) : ChangeUi
}

data class MetricRowUi(
    val metric: ReportMetric,
    val mean: MetricState,
    val recordedDays: Int,
    val change: ChangeUi,
    val best: DayStat?,
    val worst: DayStat?,
)

data class DayStat(val epochDay: Long, val value: Double, val unit: String?)

data class ReportDetailUi(
    val type: ReportPeriodType,
    val startEpochDay: Long,
    val endEpochDay: Long,
    val partial: Boolean,
    val daysInPeriod: Int,
    val coverageDays: Int,
    val coveragePercent: Int,
    val sparse: Boolean,
    val metrics: List<MetricRowUi>,
    val workouts: MetricState,
    val meanStrainOnWorkoutDays: MetricState,
    val workoutDaysWithStrain: Int,
    val loadAtEnd: LoadAtEnd,
    val goals: List<GoalAchievement>,
    val isDemo: Boolean,
)

sealed interface ReportsUi {
    data object Loading : ReportsUi
    data class Ready(val type: ReportPeriodType, val items: List<ReportItemUi>, val isDemo: Boolean) : ReportsUi
}

private val DERIVED = DataProvenance.MATHEMATICALLY_DERIVED

private fun provenanceOf(metric: MetricType, provenance: Map<MetricType, DataProvenance?>): DataProvenance? =
    provenance[metric] ?: if (metric.isDerived) DERIVED else null

private fun meanState(s: MetricSummary, decimals: Int, unit: String?, provenance: DataProvenance?, partial: Boolean): MetricState {
    val mean = s.mean ?: return MetricState.Unavailable(MetricReason.NO_DATA)
    return MetricState.Value(mean, decimals, unit, provenance, isProvisional = partial)
}

fun buildItem(report: PeriodReport, provenance: Map<MetricType, DataProvenance?>): ReportItemUi = ReportItemUi(
    type = report.type, startEpochDay = report.startEpochDay, endEpochDay = report.endEpochDay, partial = report.partial,
    daysInPeriod = report.daysInPeriod, coverageDays = report.coverageDays, sparse = report.sparse,
    recovery = meanState(report.recovery, 0, MetricType.RECOVERY_SCORE.unit, provenanceOf(MetricType.RECOVERY_SCORE, provenance), report.partial),
    sleep = meanState(report.sleep, 0, MetricType.SLEEP_SCORE.unit, provenanceOf(MetricType.SLEEP_SCORE, provenance), report.partial),
)

fun buildDetail(report: PeriodReport, source: ReportSource): ReportDetailUi {
    val provenance = source.provenance
    fun row(metric: ReportMetric, type: MetricType, s: MetricSummary, decimals: Int, unit: String?): MetricRowUi {
        val prov = provenanceOf(type, provenance)
        fun stat(d: com.apex.athlete.core.analytics.goals.DayValue?) = d?.let { dv -> dv.value?.let { DayStat(dv.epochDay, it, unit) } }
        return MetricRowUi(
            metric = metric,
            mean = meanState(s, decimals, unit, prov, report.partial),
            recordedDays = s.recordedDays,
            change = s.change?.let { ChangeUi.Delta(it, decimals) } ?: ChangeUi.Missing(s.changeMissingReason ?: ChangeMissingReason.INSUFFICIENT_BOTH),
            best = stat(s.best), worst = stat(s.worst),
        )
    }
    return ReportDetailUi(
        type = report.type, startEpochDay = report.startEpochDay, endEpochDay = report.endEpochDay, partial = report.partial,
        daysInPeriod = report.daysInPeriod, coverageDays = report.coverageDays,
        coveragePercent = Math.round(report.coverage * 100).toInt(), sparse = report.sparse,
        metrics = listOf(
            row(ReportMetric.RECOVERY, MetricType.RECOVERY_SCORE, report.recovery, 0, MetricType.RECOVERY_SCORE.unit),
            row(ReportMetric.SLEEP, MetricType.SLEEP_SCORE, report.sleep, 0, MetricType.SLEEP_SCORE.unit),
            row(ReportMetric.STRAIN, MetricType.STRAIN_SCORE, report.strain, 1, null),
            row(ReportMetric.HRV, MetricType.HRV_RMSSD, report.hrv, 0, MetricType.HRV_RMSSD.unit),
            row(ReportMetric.RESTING_HR, MetricType.RESTING_HEART_RATE, report.restingHr, 0, MetricType.RESTING_HEART_RATE.unit),
        ),
        workouts = report.totalWorkouts?.let { MetricState.Value(it.toDouble(), 0, null, source.workoutProvenance, isProvisional = report.partial) }
            ?: MetricState.Unavailable(MetricReason.NO_DATA),
        meanStrainOnWorkoutDays = report.meanStrainOnWorkoutDays?.let { MetricState.Value(it, 1, null, DERIVED, isProvisional = report.partial) }
            ?: MetricState.Unavailable(MetricReason.NO_DATA),
        workoutDaysWithStrain = report.workoutDaysWithStrain,
        loadAtEnd = report.loadAtEnd,
        goals = report.goals,
        isDemo = source.isDemo,
    )
}
