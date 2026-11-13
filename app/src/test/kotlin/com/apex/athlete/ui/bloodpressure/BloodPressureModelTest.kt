package com.apex.athlete.ui.bloodpressure

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.analytics.bp.BloodPressureCategory
import com.apex.athlete.core.analytics.bp.BloodPressureMissingReason
import com.apex.athlete.core.data.extras.DemoWriteRefusedException
import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import com.apex.athlete.core.database.entity.BloodPressureSource
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.ui.quicklog.WriteOutcome
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class BloodPressureModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private val now = 100L * 86_400_000L
    private fun e(id: String, s: Double, d: Double, daysAgo: Double, pulse: Int? = null) = BloodPressureReadingEntity(
        id, now - (daysAgo * 86_400_000L).toLong(), s, d, pulse, BloodPressureSource.MANUAL, DataProvenance.USER_REPORTED,
    )

    @Test fun oneOrTwoReadingsGiveNoAverageCategoryButEachRowIsClassified() {
        val ui = BpForm.ui(listOf(e("a", 135.0, 85.0, 1.0), e("b", 118.0, 76.0, 2.0)), now)
        assertNull(ui.average.category)
        assertEquals(BloodPressureMissingReason.INSUFFICIENT_READINGS, ui.average.missingReason)
        assertEquals(2, ui.windowReadingCount)
        assertEquals(BloodPressureCategory.STAGE_1, ui.rows.first { it.id == "a" }.evaluation.category)
        assertEquals(BloodPressureCategory.NORMAL, ui.rows.first { it.id == "b" }.evaluation.category)
    }

    @Test fun threeReadingsInTheWindowGiveAnAverageCategory() {
        val ui = BpForm.ui(listOf(e("a", 132.0, 84.0, 1.0), e("b", 136.0, 86.0, 2.0), e("c", 134.0, 82.0, 3.0)), now)
        assertEquals(BloodPressureCategory.STAGE_1, ui.average.category)
        assertEquals(3, ui.average.validReadings)
    }

    @Test fun readingsOlderThanTheWindowAreListedButNotAveraged() {
        val ui = BpForm.ui(listOf(e("a", 130.0, 80.0, 1.0), e("b", 130.0, 80.0, 2.0), e("c", 130.0, 80.0, 9.0)), now)
        assertEquals(3, ui.rows.size)
        assertEquals(2, ui.windowReadingCount)
        assertNull(ui.average.category)
    }

    @Test fun rowsAreNewestFirst() {
        val ui = BpForm.ui(listOf(e("old", 120.0, 80.0, 5.0), e("new", 120.0, 80.0, 1.0)), now)
        assertEquals(listOf("new", "old"), ui.rows.map { it.id })
    }

    @Test fun implausibleStoredReadingHasNoCategory() {
        val ui = BpForm.ui(listOf(e("x", 45.0, 25.0, 1.0)), now) // repository accepts 40/20, the classifier needs 50/30
        assertNull(ui.rows.single().evaluation.category)
        assertEquals(BloodPressureMissingReason.IMPLAUSIBLE_READING, ui.rows.single().evaluation.missingReason)
    }

    @Test fun entryParsingChecksRangesOrderAndOptionalPulse() {
        assertEquals(ParsedBp(120, 80, null), BpEntry.parse(BpDraft("120", "80", "")).reading)
        assertEquals(ParsedBp(120, 80, 64), BpEntry.parse(BpDraft("120", "80", "64")).reading)
        assertEquals(setOf(BpField.SYSTOLIC), BpEntry.parse(BpDraft("20", "80", "")).errors)
        assertEquals(setOf(BpField.ORDER), BpEntry.parse(BpDraft("80", "90", "")).errors)
        assertEquals(setOf(BpField.PULSE), BpEntry.parse(BpDraft("120", "80", "10")).errors)
        assertEquals(setOf(BpField.SYSTOLIC, BpField.DIASTOLIC), BpEntry.parse(BpDraft()).errors)
    }

    private fun vm(inserted: MutableList<ParsedBp>, fail: Exception? = null, handle: SavedStateHandle = SavedStateHandle()) =
        BloodPressureViewModel(
            readings = flowOf(emptyList()), nowMillis = { now },
            insert = { r -> fail?.let { throw it }; inserted += r }, remove = {}, handle = handle,
        ).also { v -> CoroutineScope(Dispatchers.Main).launch { v.ui.collect { } } }

    @Test fun invalidSaveShowsErrorsAndWritesNothing() {
        val list = ArrayList<ParsedBp>()
        val v = vm(list)
        v.setSystolic("120")
        v.save()
        assertTrue(v.showErrors.value)
        assertTrue(list.isEmpty())
    }

    @Test fun validSaveClearsTheForm() {
        val list = ArrayList<ParsedBp>()
        val v = vm(list)
        v.setSystolic("125"); v.setDiastolic("82"); v.setPulse("61")
        v.save()
        assertEquals(listOf(ParsedBp(125, 82, 61)), list)
        assertEquals(BpDraft(), v.draft.value)
        assertEquals(WriteOutcome.SAVED, v.outcome.value)
        assertNotNull(v.ui.value)
    }

    @Test fun demoModeKeepsTheFormAndSaysSo() {
        val v = vm(ArrayList(), DemoWriteRefusedException())
        v.setSystolic("125"); v.setDiastolic("82")
        v.save()
        assertEquals(WriteOutcome.DEMO, v.outcome.value)
        assertEquals("125", v.draft.value.systolic)
    }

    @Test fun formSurvivesProcessDeath() {
        val h = SavedStateHandle()
        vm(ArrayList(), handle = h).setSystolic("133")
        assertEquals("133", vm(ArrayList(), handle = h).draft.value.systolic)
    }
}
