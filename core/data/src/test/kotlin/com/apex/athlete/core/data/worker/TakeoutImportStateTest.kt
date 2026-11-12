package com.apex.athlete.core.data.worker

import com.apex.athlete.core.data.takeout.TakeoutCategory
import com.apex.athlete.core.data.takeout.TakeoutImportProgress
import com.apex.athlete.core.data.takeout.TakeoutImporterFixtures
import com.apex.athlete.core.data.takeout.TakeoutPartStatus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The mapping between engine progress, WorkManager data and the state the screens see. Pure; no Android. */
class TakeoutImportStateTest {

    @Test
    fun progressRoundTripsThroughPlainKeyValueData() {
        val running = TakeoutImportState.Running(filesDone = 3, filesTotal = 12, rowsWritten = 4_000_000_000L, currentType = TakeoutCategory.HEART_RATE.key)
        assertEquals(running, TakeoutImportCodec.runningFrom(TakeoutImportCodec.progressData(running)))
        val listing = TakeoutImportState.Running(0, 0, 0, TakeoutPhase.INSPECTING)
        assertEquals(listing, TakeoutImportCodec.runningFrom(TakeoutImportCodec.progressData(listing)))
        assertEquals(TakeoutImportState.Running(0, 0, 0, null), TakeoutImportCodec.runningFrom(emptyMap()))
    }

    @Test
    fun filesDoneCountsAFileOnlyOnceItIsFinished() {
        fun importing(index: Int, finished: Boolean) =
            TakeoutImportProgress.Importing(index, 5, TakeoutCategory.STEPS, 10, 0, 0, finished)
        assertEquals(2, TakeoutImportCodec.running(importing(3, false), 0, 5).filesDone)
        assertEquals(3, TakeoutImportCodec.running(importing(3, true), 0, 5).filesDone)
        val recalculating = TakeoutImportCodec.running(TakeoutImportProgress.Recalculating(2, 9), 77, 5)
        assertEquals(TakeoutImportState.Running(5, 5, 77, TakeoutPhase.RECALCULATING), recalculating)
    }

    @Test
    fun aSummaryRoundTripsIncludingMissingDates() {
        val full = TakeoutImportSummary(12, 40, 9_000_000_000L, 5, 7, 2, 30, 19_000L, 19_900L, hasWarnings = true, nothingNew = false)
        assertEquals(full, TakeoutImportCodec.summaryFrom(TakeoutImportCodec.outputData(full)))
        val empty = full.copy(firstEpochDay = null, lastEpochDay = null, hasWarnings = false, nothingNew = true)
        val back = TakeoutImportCodec.summaryFrom(TakeoutImportCodec.outputData(empty))
        assertEquals(empty, back)
        assertNull(back.firstEpochDay)
    }

    @Test
    fun workPhasesMapToTheFourStates() {
        val running = mapOf<String, Any?>(TakeoutImportCodec.KEY_FILES_TOTAL to 4, TakeoutImportCodec.KEY_FILES_DONE to 1)
        assertEquals(TakeoutImportState.Idle, TakeoutStateMapper.map(TakeoutWorkPhase.NONE, emptyMap(), emptyMap()))
        assertEquals(TakeoutImportState.Idle, TakeoutStateMapper.map(TakeoutWorkPhase.STOPPED, running, emptyMap()))
        assertEquals(TakeoutImportState.Running(1, 4, 0, null), TakeoutStateMapper.map(TakeoutWorkPhase.QUEUED_OR_RUNNING, running, emptyMap()))
        assertEquals(
            TakeoutImportState.Failed(TakeoutFailure.DEMO_MODE),
            TakeoutStateMapper.map(TakeoutWorkPhase.FAILED, emptyMap(), TakeoutImportCodec.failureData(TakeoutFailure.DEMO_MODE)),
        )
        assertEquals(TakeoutImportState.Failed(TakeoutFailure.FAILED), TakeoutStateMapper.map(TakeoutWorkPhase.FAILED, emptyMap(), emptyMap()))
        val done = TakeoutStateMapper.map(TakeoutWorkPhase.SUCCEEDED, emptyMap(), TakeoutImportCodec.outputData(TakeoutImporterFixtures.summary()))
        assertTrue(done is TakeoutImportState.Completed)
    }

    @Test
    fun failureCodesNameWhyAnArchiveWasUnusable() {
        fun code(vararg parts: TakeoutPartStatus) = TakeoutImporterFixtures.failureFor(*parts)
        assertEquals(TakeoutFailure.UNREADABLE, code(TakeoutPartStatus.UNREADABLE))
        assertEquals(TakeoutFailure.UNSUPPORTED_FORMAT, code(TakeoutPartStatus.UNSUPPORTED_TGZ))
        assertEquals(TakeoutFailure.NOT_AN_ARCHIVE, code(TakeoutPartStatus.NOT_A_ZIP))
        assertEquals(TakeoutFailure.NOT_AN_ARCHIVE, code(TakeoutPartStatus.NOT_A_ZIP, TakeoutPartStatus.UNREADABLE))
        assertNull(TakeoutImporterFixtures.failureFor(TakeoutPartStatus.OK))
    }
}
