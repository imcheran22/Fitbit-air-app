package com.apex.athlete.ui.goals

import com.apex.athlete.core.data.repository.TrendPoint
import com.apex.athlete.core.database.entity.GoalEntity
import com.apex.athlete.core.database.entity.GoalKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricState
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GoalsModelTest {
    private val src = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    // 2024-01-03 is a Wednesday (epoch day 19725).
    private val today = 19_725L

    private fun goal(kind: GoalKind, target: Double, enabled: Boolean = true) = GoalEntity("g-${kind.name}", kind, target, enabled, false, 0L)
    private fun series(vararg v: Pair<Long, Double?>) = SeriesSource(v.map { TrendPoint(it.first, it.second) }, src)

    @Test fun dailyGoalReportsStreakAndProvisionalValue() {
        val sources = mapOf(MetricType.STEPS to series(today - 2 to 9000.0, today - 1 to 8500.0, today to 3000.0))
        val row = buildGoalRow(goal(GoalKind.DAILY_STEPS, 8000.0), sources, today)
        val v = assertIs<MetricState.Value>(row.state)
        assertEquals(3000.0, v.value)
        assertTrue(v.isProvisional)
        assertEquals(src, v.provenance)
        assertEquals(2, row.currentStreak) // an unfinished today does not break the run
        assertFalse(row.achieved)
    }

    @Test fun missingDayIsUnavailableNotZero() {
        val sources = mapOf(MetricType.STEPS to series(today - 1 to 9000.0, today to null))
        val row = buildGoalRow(goal(GoalKind.DAILY_STEPS, 8000.0), sources, today)
        assertIs<MetricState.Unavailable>(row.state)
        assertNull(row.barFraction)
        assertEquals(com.apex.athlete.core.analytics.goals.GoalMissingReason.NOT_RECORDED_TODAY, row.missing)
    }

    @Test fun noSeriesAtAllIsUnavailable() {
        val row = buildGoalRow(goal(GoalKind.WEEKLY_AZM, 150.0), emptyMap(), today)
        assertIs<MetricState.Unavailable>(row.state)
        assertEquals(com.apex.athlete.core.analytics.goals.GoalMissingReason.NO_DATA_THIS_WEEK, row.missing)
    }

    @Test fun weeklyActiveMinutesNeedBothPartsOfTheSum() {
        val sources = mapOf(
            MetricType.MODERATELY_ACTIVE_MINUTES to series(today - 1 to 20.0, today to 10.0),
            MetricType.VERY_ACTIVE_MINUTES to series(today - 1 to 15.0, today to null),
        )
        val s = seriesFor(GoalKind.WEEKLY_ACTIVE_MINUTES, sources)
        assertEquals(35.0, s.first { it.epochDay == today - 1 }.value)
        assertNull(s.first { it.epochDay == today }.value) // one part missing: not recorded, not a partial sum
    }

    @Test fun weeklyActiveSeriesIsEmptyWhenAPartIsAbsent() {
        val sources = mapOf(MetricType.MODERATELY_ACTIVE_MINUTES to series(today to 10.0))
        assertTrue(seriesFor(GoalKind.WEEKLY_ACTIVE_MINUTES, sources).isEmpty())
    }

    @Test fun weeklyGoalMarksLowerBound() {
        // Monday is today-2. Only Monday is recorded.
        val sources = mapOf(MetricType.ACTIVE_ZONE_MINUTES to series(today - 2 to 40.0))
        val row = buildGoalRow(goal(GoalKind.WEEKLY_AZM, 150.0), sources, today)
        assertEquals(40.0, (row.state as MetricState.Value).value)
        assertTrue(row.week!!.lowerBound)
        assertEquals(1, row.week!!.recordedDays)
        assertEquals(3, row.week!!.elapsedDays)
    }

    @Test fun recoveredDaysAreDerived() {
        val sources = mapOf(MetricType.RECOVERY_SCORE to series(today - 1 to 80.0, today to 40.0))
        val row = buildGoalRow(goal(GoalKind.WEEKLY_RECOVERED_DAYS, 3.0), sources, today)
        val v = row.state as MetricState.Value
        assertEquals(1.0, v.value)
        assertEquals(DataProvenance.MATHEMATICALLY_DERIVED, v.provenance)
    }

    @Test fun pausedGoalIsNotEvaluated() {
        val sources = mapOf(MetricType.STEPS to series(today to 9000.0))
        val row = buildGoalRow(goal(GoalKind.DAILY_STEPS, 8000.0, enabled = false), sources, today)
        assertTrue(row.paused)
        assertIs<MetricState.Unavailable>(row.state)
        assertNull(row.currentStreak)
    }

    @Test fun targetParsing() {
        assertEquals(TargetParse.Empty, parseTarget(GoalKind.DAILY_STEPS, "  "))
        assertEquals(TargetParse.Valid(8000.0), parseTarget(GoalKind.DAILY_STEPS, "8000"))
        assertEquals(TargetParse.Invalid, parseTarget(GoalKind.DAILY_STEPS, "0"))
        assertEquals(TargetParse.Invalid, parseTarget(GoalKind.DAILY_STEPS, "12.5"))
        assertEquals(TargetParse.Invalid, parseTarget(GoalKind.DAILY_SLEEP_MINUTES, "1441"))
        assertEquals(TargetParse.Valid(7.0), parseTarget(GoalKind.WEEKLY_RECOVERED_DAYS, "7"))
        assertEquals(TargetParse.Invalid, parseTarget(GoalKind.WEEKLY_RECOVERED_DAYS, "8"))
        assertEquals(TargetParse.Invalid, parseTarget(GoalKind.DAILY_STEPS, "99999999999"))
    }

    @Test fun oneGoalPerKind() {
        val existing = listOf(goal(GoalKind.DAILY_STEPS, 1.0))
        assertFalse(GoalKind.DAILY_STEPS in availableKinds(existing))
        assertEquals(GoalKind.entries.size - 1, availableKinds(existing).size)
    }

    @Test fun everyStoredKindMapsToAnEngineKind() {
        GoalKind.entries.forEach { assertEquals(it.name, it.toEngine().name) }
    }
}
