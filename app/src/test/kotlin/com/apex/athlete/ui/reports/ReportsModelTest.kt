package com.apex.athlete.ui.reports

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.analytics.report.ReportEngine
import com.apex.athlete.core.analytics.report.ReportPeriodType
import com.apex.athlete.core.analytics.report.ReportRequest
import com.apex.athlete.core.data.repository.TrendIntelligenceState
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.detail.TEST_TODAY
import com.apex.athlete.ui.detail.testFormatter
import com.apex.athlete.ui.detail.testTrend
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class ReportsModelTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val today = TEST_TODAY // 2027-01-15, a Friday

    private fun state(vararg t: com.apex.athlete.core.data.repository.MetricTrend) =
        TrendIntelligenceState(isDemo = false, asOfDay = today, rangeDays = 30, trends = t.toList())

    @Test fun weeksStartOnMondayAndMonthsOnTheFirst() {
        val weeks = periodStarts(ReportPeriodType.WEEK, today, 3)
        assertEquals(LocalDate.ofEpochDay(today).minusDays(4), LocalDate.ofEpochDay(weeks[0]))
        assertEquals(java.time.DayOfWeek.MONDAY, LocalDate.ofEpochDay(weeks[0]).dayOfWeek)
        assertEquals(listOf(7L, 7L), weeks.zipWithNext { a, b -> a - b })
        val months = periodStarts(ReportPeriodType.MONTH, today, 3)
        assertEquals(listOf(LocalDate.of(2027, 1, 1), LocalDate.of(2026, 12, 1), LocalDate.of(2026, 11, 1)), months.map(LocalDate::ofEpochDay))
    }

    @Test fun missingMetricsStayNullAndWorkoutsOnlyCountWhenLogged() {
        val recovery = testTrend(MetricType.RECOVERY_SCORE, listOf(70.0, null, 60.0), today)
        val src = buildReportSource(state(recovery), listOf(WorkoutRef(today, DataProvenance.IMPORTED_HEALTH_CONNECT), WorkoutRef(today, DataProvenance.IMPORTED_HEALTH_CONNECT)), emptyList())
        val middle = src.days.first { it.epochDay == today - 1 }
        assertNull(middle.recovery)
        assertNull(middle.sleepScore)
        assertNull(src.days.first { it.epochDay == today - 2 }.workoutCount) // not "0": Apex has no record either way
        assertEquals(2, src.days.first { it.epochDay == today }.workoutCount)
        assertEquals(DataProvenance.IMPORTED_HEALTH_CONNECT, src.workoutProvenance)
    }

    @Test fun partialSparseWeekIsLabelledAndNeverFilledIn() {
        val monday = periodStarts(ReportPeriodType.WEEK, today, 1).first()
        val recovery = testTrend(MetricType.RECOVERY_SCORE, listOf(70.0), today - 4) // only Monday
        val src = buildReportSource(state(recovery), emptyList(), emptyList())
        val report = ReportEngine.summarise(ReportRequest(ReportPeriodType.WEEK, monday, src.days, asOfEpochDay = today))
        val ui = buildDetail(report, src)
        assertTrue(ui.partial)
        assertEquals(5, ui.daysInPeriod)
        assertTrue(ui.sparse)
        assertEquals(1, ui.coverageDays)
        val rec = ui.metrics.first { it.metric == ReportMetric.RECOVERY }
        val mean = assertIs<MetricState.Value>(rec.mean)
        assertEquals(70.0, mean.value)
        assertTrue(mean.isProvisional)
        assertIs<ChangeUi.Missing>(rec.change)
        assertIs<MetricState.Unavailable>(ui.metrics.first { it.metric == ReportMetric.SLEEP }.mean)
        assertIs<MetricState.Unavailable>(ui.workouts)
    }

    @Test fun loadZoneIsAttachedToTheLastDayOnly() {
        val days = withLoadOnDay(emptyList(), today, WorkloadZone.SWEET_SPOT, false)
        assertEquals(WorkloadZone.SWEET_SPOT, days.single().loadZone)
        assertEquals(emptyList(), withLoadOnDay(emptyList(), today, null, false))
    }

    @Test fun shareContentShowsMissingAsDashesWithProvenanceOnValues() {
        val monday = periodStarts(ReportPeriodType.WEEK, today, 1).first()
        val recovery = testTrend(MetricType.RECOVERY_SCORE, listOf(70.0, 66.0), today - 3)
        val src = buildReportSource(state(recovery), emptyList(), emptyList())
        val report = ReportEngine.summarise(ReportRequest(ReportPeriodType.WEEK, monday, src.days, asOfEpochDay = today))
        val content = buildShareContent(buildDetail(report, src), testFormatter(context))
        val rec = content.rows.first()
        assertEquals("68 %", rec.value)
        assertTrue(rec.note!!.contains("recorded"), rec.note)
        val sleep = content.rows[1]
        assertEquals("--", sleep.value)
        assertTrue(content.rows.any { it.label.isNotBlank() && it.value == "--" })
        assertTrue(content.footer.isNotBlank())
    }

    @Test fun fileNamesAreFixedWordsAndAnIsoDate() {
        assertEquals("apex-report-week-2027-01-11.pdf", ReportSharer.fileName(ReportPeriodType.WEEK, LocalDate.of(2027, 1, 11).toEpochDay(), "pdf"))
    }

    @Test fun writeReplacesEarlierSharedReports() {
        val old = ReportSharer.write(context, "old.png") { it.write(1) }
        val fresh = ReportSharer.write(context, "new.png") { it.write(2) }
        assertTrue(!old.exists())
        assertTrue(fresh.exists())
        assertEquals(context.cacheDir.resolve("reports"), fresh.parentFile)
        fresh.delete()
    }

    @Test fun everyAnalyticsGoalKindHasAStoredLabel() {
        com.apex.athlete.core.analytics.goals.GoalKind.entries.forEach { goalKindLabelRes(it) }
    }
}
