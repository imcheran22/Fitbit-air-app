package com.apex.athlete.ui.journal

import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricState
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class JournalModelTest {
    @Test
    fun tappingSelectedLevelClearsIt() {
        assertEquals(0, toggleLevel(4, 4))
        assertEquals(7, toggleLevel(4, 7))
        assertEquals(10, toggleLevel(0, 99))
    }

    @Test
    fun cannotSaveWhileLoadingOrUnchanged() {
        assertFalse(canSave(CheckInDraft(3, 0), null))
        assertFalse(canSave(CheckInDraft(3, 0), StoredCheckIn(3, null)))
        assertTrue(canSave(CheckInDraft(3, 5), StoredCheckIn(3, null)))
    }

    @Test
    fun clearingAStoredRatingCanBeSaved() {
        assertTrue(canSave(CheckInDraft(0, 0), StoredCheckIn(3, null)))
    }

    @Test
    fun draftZeroMapsToNull() {
        assertEquals(StoredCheckIn(null, 6), CheckInDraft(0, 6).toStored())
        assertTrue(CheckInDraft().toStored().isEmpty)
    }

    @Test
    fun anchorsGroupLevelsInPairs() {
        assertEquals(R.string.journal_fatigue_1, anchorRes(CheckInScale.FATIGUE, 1))
        assertEquals(R.string.journal_fatigue_1, anchorRes(CheckInScale.FATIGUE, 2))
        assertEquals(R.string.journal_fatigue_3, anchorRes(CheckInScale.FATIGUE, 5))
        assertEquals(R.string.journal_soreness_5, anchorRes(CheckInScale.SORENESS, 10))
    }

    @Test
    fun storedRatingStates() {
        assertEquals(MetricState.Loading, storedRatingState(false, null, "of 10", null))
        assertIs<MetricState.Unavailable>(storedRatingState(true, null, "of 10", null))
        val v = assertIs<MetricState.Value>(storedRatingState(true, 4, "of 10", null))
        assertEquals(4.0, v.value)
        assertEquals(DataProvenance.USER_REPORTED, v.provenance)
    }
}
