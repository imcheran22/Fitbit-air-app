package com.apex.athlete.ui.goals

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.analytics.goals.DayValue
import com.apex.athlete.core.analytics.goals.GoalEngine
import com.apex.athlete.core.analytics.goals.GoalInput
import com.apex.athlete.core.analytics.goals.GoalMissingReason
import com.apex.athlete.core.analytics.goals.GoalProgress
import com.apex.athlete.core.analytics.goals.GoalSpec
import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.analytics.goals.GoalKind as EngineKind
import com.apex.athlete.core.database.entity.GoalKind as StoredKind

/** Days of history behind a goal: enough for a long streak to show, bounded so the read stays cheap. */
const val GOAL_HISTORY_DAYS = 90

/** The stored goal kind and the engine's kind carry the same five names; this is the one place they are joined. */
fun StoredKind.toEngine(): EngineKind = when (this) {
    StoredKind.DAILY_STEPS -> EngineKind.DAILY_STEPS
    StoredKind.DAILY_SLEEP_MINUTES -> EngineKind.DAILY_SLEEP_MINUTES
    StoredKind.WEEKLY_ACTIVE_MINUTES -> EngineKind.WEEKLY_ACTIVE_MINUTES
    StoredKind.WEEKLY_AZM -> EngineKind.WEEKLY_AZM
    StoredKind.WEEKLY_RECOVERED_DAYS -> EngineKind.WEEKLY_RECOVERED_DAYS
}

@StringRes
fun kindLabelRes(kind: StoredKind): Int = when (kind) {
    StoredKind.DAILY_STEPS -> R.string.goals_kind_daily_steps
    StoredKind.DAILY_SLEEP_MINUTES -> R.string.goals_kind_daily_sleep
    StoredKind.WEEKLY_ACTIVE_MINUTES -> R.string.goals_kind_weekly_active
    StoredKind.WEEKLY_AZM -> R.string.goals_kind_weekly_azm
    StoredKind.WEEKLY_RECOVERED_DAYS -> R.string.goals_kind_weekly_recovered
}

/** What the target is counted in, for the text field suffix and the value unit. */
@StringRes
fun kindUnitRes(kind: StoredKind): Int = when (kind) {
    StoredKind.DAILY_STEPS -> R.string.goals_unit_steps
    StoredKind.DAILY_SLEEP_MINUTES, StoredKind.WEEKLY_ACTIVE_MINUTES, StoredKind.WEEKLY_AZM -> R.string.goals_unit_minutes
    StoredKind.WEEKLY_RECOVERED_DAYS -> R.string.goals_unit_days
}

/** The stored daily series each goal kind is measured on. Weekly active minutes = moderate + very active minutes. */
internal fun metricsFor(kind: StoredKind): List<MetricType> = when (kind) {
    StoredKind.DAILY_STEPS -> listOf(MetricType.STEPS)
    StoredKind.DAILY_SLEEP_MINUTES -> listOf(MetricType.SLEEP_DURATION)
    StoredKind.WEEKLY_ACTIVE_MINUTES -> listOf(MetricType.MODERATELY_ACTIVE_MINUTES, MetricType.VERY_ACTIVE_MINUTES)
    StoredKind.WEEKLY_AZM -> listOf(MetricType.ACTIVE_ZONE_MINUTES)
    StoredKind.WEEKLY_RECOVERED_DAYS -> listOf(MetricType.RECOVERY_SCORE)
}

/** One metric's daily points with the provenance of its readings. */
data class SeriesSource(val points: List<TrendPoint>, val provenance: DataProvenance?)

/**
 * The daily series for [kind]. A day is recorded only when every metric it is built from is recorded (a sum with a missing
 * part would be a silent lower bound), otherwise it is null = not recorded, never 0.
 */
fun seriesFor(kind: StoredKind, sources: Map<MetricType, SeriesSource>): List<DayValue> {
    val metrics = metricsFor(kind)
    val lists = metrics.map { sources[it]?.points ?: return emptyList() }
    val byDay = lists.map { list -> list.associate { it.epochDay to it.value } }
    val days = lists.flatMap { l -> l.map { it.epochDay } }.toSortedSet()
    return days.map { day ->
        val values = byDay.map { it[day] }
        DayValue(day, if (values.any { it == null }) null else values.sumOf { it!! })
    }
}

/** Provenance of a goal's value: the readings' own, or derived for counts of recovered days. */
fun provenanceFor(kind: StoredKind, sources: Map<MetricType, SeriesSource>): DataProvenance? = when (kind) {
    StoredKind.WEEKLY_RECOVERED_DAYS -> sources[MetricType.RECOVERY_SCORE]?.let { DataProvenance.MATHEMATICALLY_DERIVED }
    else -> metricsFor(kind).mapNotNull { sources[it]?.provenance }.distinct().let { p -> p.singleOrNull() ?: p.firstOrNull() }
}

/** A goal ready to draw. [state] is Value / Unavailable only; [paused] goals are not evaluated. */
data class GoalRowUi(
    val id: String,
    val kind: StoredKind,
    val target: Double,
    val paused: Boolean,
    val state: MetricState,
    /** Fraction of the target reached, 0..1 for the bar (the value itself is never capped); null when no value. */
    val barFraction: Float?,
    val achieved: Boolean,
    val missing: GoalMissingReason?,
    val currentStreak: Int?,
    val bestStreak: Int?,
    val week: WeekUi?,
)

data class WeekUi(val recordedDays: Int, val elapsedDays: Int, val lowerBound: Boolean, val neededPerDay: Double?, val daysLeft: Int)

/** Evaluates one stored goal on its series; pure. */
fun buildGoalRow(goal: GoalEntity, sources: Map<MetricType, SeriesSource>, today: Long): GoalRowUi {
    val kind = goal.kind
    if (!goal.enabled) {
        return GoalRowUi(goal.id, kind, goal.target, true, MetricState.Unavailable(MetricReason.NO_DATA), null, false, null, null, null, null)
    }
    val progress: GoalProgress = GoalEngine.evaluate(GoalInput(GoalSpec(kind.toEngine(), goal.target), seriesFor(kind, sources), today))
    val value = progress.value
    val provenance = provenanceFor(kind, sources)
    val state: MetricState = if (value != null) {
        MetricState.Value(value, decimals = 0, unit = null, provenance = provenance, isProvisional = progress.provisional)
    } else {
        MetricState.Unavailable(MetricReason.NO_DATA)
    }
    val week = progress.week?.let {
        WeekUi(it.recordedDays, it.elapsedDays, it.totalIsLowerBound, it.neededPerRemainingDay, it.daysLeftInclToday)
    }
    return GoalRowUi(
        id = goal.id, kind = kind, target = goal.target, paused = false, state = state,
        barFraction = progress.fraction?.toFloat()?.coerceIn(0f, 1f),
        achieved = progress.achieved, missing = progress.missingReason,
        currentStreak = progress.currentStreak, bestStreak = progress.bestStreak, week = week,
    )
}

/** Largest target the editor accepts per kind: a day has 1440 minutes, a week 10 080 and seven days. */
fun maxTarget(kind: StoredKind): Double = when (kind) {
    StoredKind.DAILY_STEPS -> 100_000.0
    StoredKind.DAILY_SLEEP_MINUTES -> 1_440.0
    StoredKind.WEEKLY_ACTIVE_MINUTES, StoredKind.WEEKLY_AZM -> 10_080.0
    StoredKind.WEEKLY_RECOVERED_DAYS -> 7.0
}

sealed interface TargetParse {
    data class Valid(val target: Double) : TargetParse
    data object Empty : TargetParse
    data object Invalid : TargetParse
}

/** A whole number above 0 and within [maxTarget]. Apex offers no default target, so empty stays empty. */
fun parseTarget(kind: StoredKind, text: String): TargetParse {
    val t = text.trim()
    if (t.isEmpty()) return TargetParse.Empty
    if (!t.all { it.isDigit() } || t.length > 7) return TargetParse.Invalid
    val v = t.toLong().toDouble()
    return if (v > 0.0 && v <= maxTarget(kind)) TargetParse.Valid(v) else TargetParse.Invalid
}

/** One goal per kind: the kinds that can still be added. */
fun availableKinds(existing: List<GoalEntity>): List<StoredKind> = StoredKind.entries.filter { k -> existing.none { it.kind == k } }

sealed interface GoalsUi {
    data object Loading : GoalsUi
    data class Ready(val rows: List<GoalRowUi>, val addable: List<StoredKind>, val isDemo: Boolean) : GoalsUi
}

enum class GoalSaveStatus { IDLE, SAVING, DEMO, ERROR }
