package com.apex.athlete.ui.takeout

import com.apex.athlete.R
import com.apex.athlete.core.data.takeout.TakeoutCategory
import com.apex.athlete.core.data.worker.TakeoutFailure
import com.apex.athlete.core.data.worker.TakeoutImportState
import com.apex.athlete.core.data.worker.TakeoutImportSummary
import com.apex.athlete.core.data.worker.TakeoutPhase
import java.time.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class TakeoutLogicTest {
    private fun summary(
        nothingNew: Boolean = false,
        warnings: Boolean = false,
        dropped: Long = 0,
        quarantined: Long = 0,
        skipped: Int = 0,
        first: Long? = 19_000,
        last: Long? = 19_100,
    ) = TakeoutImportSummary(10, skipped, 5_000, dropped, quarantined, 0, 90, first, last, warnings, nothingNew)

    @Test fun idleHasNoPanel() = assertEquals(TakeoutPanel.Idle, panelOf(TakeoutImportState.Idle))

    @Test fun runningWithUnknownTotalHasNoFraction() {
        val p = panelOf(TakeoutImportState.Running(0, 0, 0, TakeoutPhase.INSPECTING)) as TakeoutPanel.Running
        assertNull(p.fraction)
        assertEquals(R.string.takeout_stage_inspecting, p.stage)
    }

    @Test fun runningFractionIsFilesDoneOverTotal() {
        val p = panelOf(TakeoutImportState.Running(3, 12, 900, "sleep")) as TakeoutPanel.Running
        assertEquals(0.25f, p.fraction)
        assertEquals(R.string.takeout_cat_sleep, p.stage)
        assertEquals(900L, p.rowsWritten)
    }

    @Test fun runningFractionIsClamped() {
        val p = panelOf(TakeoutImportState.Running(9, 3, 0, null)) as TakeoutPanel.Running
        assertEquals(1f, p.fraction)
        assertEquals(R.string.takeout_stage_working, p.stage)
    }

    @Test fun everyCategoryHasAName() {
        for (c in TakeoutCategory.entries) assertTrue(stageRes(c.key) != R.string.takeout_stage_working, c.key)
        assertEquals(R.string.takeout_stage_recalculating, stageRes(TakeoutPhase.RECALCULATING))
        assertEquals(R.string.takeout_stage_working, stageRes("something_new"))
    }

    @Test fun everyFailureCodeHasCopy() {
        val codes = listOf(
            TakeoutFailure.DEMO_MODE to R.string.takeout_fail_demo,
            TakeoutFailure.STORE_UNAVAILABLE to R.string.takeout_fail_store,
            TakeoutFailure.NO_INPUT to R.string.takeout_fail_no_input,
            TakeoutFailure.NOT_AN_ARCHIVE to R.string.takeout_fail_not_archive,
            TakeoutFailure.NO_RECOGNISED_FILES to R.string.takeout_fail_no_files,
            TakeoutFailure.UNREADABLE to R.string.takeout_fail_unreadable,
            TakeoutFailure.UNSUPPORTED_FORMAT to R.string.takeout_fail_unsupported,
            TakeoutFailure.FAILED to R.string.takeout_fail_generic,
        )
        for ((code, res) in codes) assertEquals(res, failureTextRes(code), code)
        assertEquals(R.string.takeout_fail_generic, failureTextRes("brand_new_code"))
    }

    @Test fun failedStateMapsMessage() {
        val p = panelOf(TakeoutImportState.Failed(TakeoutFailure.UNSUPPORTED_FORMAT)) as TakeoutPanel.Failed
        assertEquals(R.string.takeout_fail_unsupported, p.message)
    }

    @Test fun completedHeadlines() {
        assertEquals(R.string.takeout_done, (panelOf(TakeoutImportState.Completed(summary())) as TakeoutPanel.Completed).headline)
        assertEquals(R.string.takeout_done_warnings, (panelOf(TakeoutImportState.Completed(summary(warnings = true))) as TakeoutPanel.Completed).headline)
        assertEquals(R.string.takeout_done_nothing_new, (panelOf(TakeoutImportState.Completed(summary(nothingNew = true, warnings = true))) as TakeoutPanel.Completed).headline)
    }

    @Test fun completedDateRange() {
        val p = panelOf(TakeoutImportState.Completed(summary())) as TakeoutPanel.Completed
        assertEquals(LocalDate.ofEpochDay(19_000), p.firstDay)
        assertEquals(LocalDate.ofEpochDay(19_100), p.lastDay)
        val none = panelOf(TakeoutImportState.Completed(summary(first = null, last = null))) as TakeoutPanel.Completed
        assertNull(none.firstDay)
        assertNull(none.lastDay)
    }

    @Test fun countRowsHideZeroOptionalLines() {
        val labels = countRows(summary()).map { it.label }
        assertEquals(
            listOf(R.string.takeout_count_files_imported, R.string.takeout_count_rows, R.string.takeout_count_recomputed),
            labels,
        )
        val full = countRows(summary(dropped = 4, quarantined = 2, skipped = 3)).map { it.label }
        assertTrue(R.string.takeout_count_dropped in full && R.string.takeout_count_quarantined in full && R.string.takeout_count_files_skipped in full)
    }

    @Test fun demoDisablesPicking() {
        assertFalse(uiStateOf(true, null, TakeoutImportState.Idle).canPick)
        assertTrue(uiStateOf(false, null, TakeoutImportState.Idle).canPick)
        assertFalse(uiStateOf(false, null, TakeoutImportState.Running(0, 0, 0, null)).canPick)
        assertTrue(uiStateOf(false, 5L, TakeoutImportState.Failed(TakeoutFailure.FAILED)).canPick)
    }
}
