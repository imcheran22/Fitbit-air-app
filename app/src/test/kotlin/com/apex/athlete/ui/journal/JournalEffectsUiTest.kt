package com.apex.athlete.ui.journal

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.apex.athlete.core.analytics.journal.JournalEffect
import com.apex.athlete.core.analytics.journal.JournalEffectsReport
import com.apex.athlete.core.analytics.journal.JournalOutcomeKind
import com.apex.athlete.core.analytics.journal.JournalSkip
import com.apex.athlete.core.analytics.journal.JournalSkipReason
import com.apex.athlete.core.data.settings.UnitSystem
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.ui.common.ApexFormatter
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import java.time.ZoneOffset
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@RunWith(AndroidJUnit4::class)
@Config(sdk = [35], qualifiers = "en-rUS", application = android.app.Application::class)
class JournalEffectsUiTest {
    private val context: Context = ApplicationProvider.getApplicationContext()
    private val f = ApexFormatter(context, UnitSystem.METRIC, true, { ZoneOffset.UTC }, { 1_800_000_000_000L })

    private fun effect(
        factor: MetricType,
        outcome: JournalOutcomeKind,
        nWith: Int,
        nWithout: Int,
        effect: Double,
        low: Double,
        high: Double,
    ) = JournalEffect(factor.storageKey, outcome, nWith, nWithout, 0.0, 0.0, effect, low, high, 20.0, 0.04)

    private fun skip(factor: MetricType, outcome: JournalOutcomeKind, reason: JournalSkipReason, nWith: Int, nWithout: Int) =
        JournalSkip(factor.storageKey, outcome, reason, nWith, nWithout)

    @Test fun nothingJournalledSaysHowManyDaysEachFactorNeedsAndShowsNoTestCount() {
        val ui = buildEffectsUi(null, f)
        assertTrue(ui.rows.isEmpty())
        assertTrue(ui.notes.isEmpty())
        assertEquals(
            "Log factors for a few days to see associations. Each factor needs at least 5 days with it and 5 days without it, " +
                "each followed by a measured recovery or heart rate variability.",
            ui.emptySummary,
        )
        assertNull(ui.testsText)
        assertEquals(0, ui.testsPerformed)
    }

    @Test fun recoveryEffectIsWordedAsAnAssociationWithItsIntervalAndArms() {
        val report = JournalEffectsReport(
            listOf(effect(MetricType.JOURNAL_ALCOHOL, JournalOutcomeKind.RECOVERY_POINTS, 12, 31, -6.24, -11.03, -1.41)),
            emptyList(),
            1,
        )
        val ui = buildEffectsUi(report, f)
        val row = ui.rows.single()
        assertEquals(MetricType.JOURNAL_ALCOHOL, row.factor)
        assertEquals("Alcohol", row.title)
        assertEquals("Associated with next-day recovery 6.2 points lower", row.headline)
        assertEquals("95% interval: −11.0 to −1.4 points", row.interval)
        assertEquals("Based on 12 days with it and 31 days without it", row.arms)
        assertEquals("The interval does not include zero.", row.certainty)
        assertTrue(row.excludesZero)
        assertEquals(
            "Alcohol. Associated with next-day recovery 6.2 points lower. 95% interval: −11.0 to −1.4 points. " +
                "Based on 12 days with it and 31 days without it. The interval does not include zero. Calculated from your own answers.",
            row.spoken,
        )
        assertNull(ui.emptySummary)
        assertEquals("Tests performed: 1. No correction is applied for running several, so some intervals will exclude zero by chance alone.", ui.testsText)
        assertEquals(1, ui.testsPerformed)
        // Never causal wording.
        assertFalse(row.headline.contains("caused", ignoreCase = true))
    }

    @Test fun hrvEffectIsInPercentAndAnIntervalThroughZeroIsSaidToBePossiblyChance() {
        val report = JournalEffectsReport(
            listOf(effect(MetricType.JOURNAL_LATE_CAFFEINE, JournalOutcomeKind.HRV_PERCENT, 8, 40, 8.46, -2.04, 19.04)),
            emptyList(),
            1,
        )
        val row = buildEffectsUi(report, f).rows.single()
        assertEquals("Late caffeine", row.title)
        assertEquals("Associated with next-day HRV 8.5% higher", row.headline)
        assertEquals("95% interval: −2.0% to +19.0%", row.interval)
        assertEquals("The interval includes zero, so this could be chance.", row.certainty)
        assertFalse(row.excludesZero)
    }

    @Test fun aNegligibleEffectIsNotShownAsLowerOrHigher() {
        val report = JournalEffectsReport(
            listOf(effect(MetricType.JOURNAL_TRAVEL, JournalOutcomeKind.RECOVERY_POINTS, 6, 6, 0.03, -3.0, 3.1)),
            emptyList(),
            1,
        )
        assertEquals("Associated with no difference in next-day recovery", buildEffectsUi(report, f).rows.single().headline)
    }

    @Test fun nothingQualifyingListsHowManyMoreDaysAreNeededAndTheZeroTestCount() {
        val report = JournalEffectsReport(
            emptyList(),
            listOf(
                skip(MetricType.JOURNAL_TRAVEL, JournalOutcomeKind.RECOVERY_POINTS, JournalSkipReason.TOO_FEW_PER_ARM, 2, 40),
                skip(MetricType.JOURNAL_ALCOHOL, JournalOutcomeKind.HRV_PERCENT, JournalSkipReason.TOO_FEW_PER_ARM, 1, 0),
            ),
            0,
        )
        val ui = buildEffectsUi(report, f)
        assertTrue(ui.rows.isEmpty())
        assertEquals("Nothing qualifies yet. Each factor needs at least 5 days with it and 5 days without it.", ui.emptySummary)
        assertEquals("Tests performed: 0. No factor has enough days yet.", ui.testsText)
        // Alcohol comes before Travel in the journal's order.
        assertEquals(listOf(MetricType.JOURNAL_ALCOHOL, MetricType.JOURNAL_TRAVEL), ui.notes.map { it.factor })
        val alcohol = ui.notes[0]
        assertEquals("Alcohol and next-day HRV", alcohol.title)
        assertEquals(
            listOf("Days so far: 1 with it, 0 without it.", "More days with it needed: 4.", "More days without it needed: 5."),
            alcohol.lines,
        )
        val travel = ui.notes[1]
        assertEquals("Travel and next-day recovery", travel.title)
        assertEquals(listOf("Days so far: 2 with it, 40 without it.", "More days with it needed: 3."), travel.lines)
        assertEquals("Travel and next-day recovery. Days so far: 2 with it, 40 without it. More days with it needed: 3.", travel.spoken)
    }

    @Test fun anOutcomeWithoutVarianceIsExplained() {
        val report = JournalEffectsReport(
            emptyList(),
            listOf(skip(MetricType.JOURNAL_LATE_MEAL, JournalOutcomeKind.RECOVERY_POINTS, JournalSkipReason.NO_VARIANCE, 6, 7)),
            0,
        )
        val note = buildEffectsUi(report, f).notes.single()
        assertEquals(
            listOf("Days so far: 6 with it, 7 without it.", "The outcome was identical on every day, so no interval could be computed."),
            note.lines,
        )
    }

    @Test fun reportWithNoOutcomesSaysSo() {
        val ui = buildEffectsUi(JournalEffectsReport(emptyList(), emptyList(), 0), f)
        assertEquals("There is no next-morning recovery or heart rate variability to compare with yet.", ui.emptySummary)
    }

    @Test fun rowsAndNotesFollowTheJournalOrderAndUnknownFactorsAreDropped() {
        val report = JournalEffectsReport(
            listOf(
                effect(MetricType.JOURNAL_TRAVEL, JournalOutcomeKind.RECOVERY_POINTS, 5, 5, 4.0, 1.0, 7.0),
                effect(MetricType.JOURNAL_ALCOHOL, JournalOutcomeKind.HRV_PERCENT, 5, 5, -4.0, -7.0, -1.0),
                effect(MetricType.JOURNAL_ALCOHOL, JournalOutcomeKind.RECOVERY_POINTS, 5, 5, -4.0, -7.0, -1.0),
                JournalEffect("not_a_factor", JournalOutcomeKind.RECOVERY_POINTS, 5, 5, 0.0, 0.0, 1.0, 0.0, 2.0, 8.0, 0.5),
            ),
            listOf(skip(MetricType.JOURNAL_STRESSFUL_DAY, JournalOutcomeKind.HRV_PERCENT, JournalSkipReason.TOO_FEW_PER_ARM, 4, 9)),
            4,
        )
        val ui = buildEffectsUi(report, f)
        assertEquals(
            listOf(
                MetricType.JOURNAL_ALCOHOL to JournalOutcomeKind.RECOVERY_POINTS,
                MetricType.JOURNAL_ALCOHOL to JournalOutcomeKind.HRV_PERCENT,
                MetricType.JOURNAL_TRAVEL to JournalOutcomeKind.RECOVERY_POINTS,
            ),
            ui.rows.map { it.factor to it.outcome },
        )
        assertNull(ui.emptySummary)
        assertEquals("Associated with next-day recovery 4.0 points higher", ui.rows[2].headline)
        // Some rows exist and one factor still needs days: both are shown, with the real test count.
        assertEquals(listOf("Days so far: 4 with it, 9 without it.", "More days with it needed: 1."), ui.notes.single().lines)
        assertEquals(4, ui.testsPerformed)
    }
}
