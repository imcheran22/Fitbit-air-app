package com.apex.athlete.ui.food

import androidx.lifecycle.SavedStateHandle
import com.apex.athlete.core.analytics.nutrition.EnergyBalanceMissingReason
import com.apex.athlete.core.analytics.nutrition.MacroSplitMissingReason
import com.apex.athlete.core.data.extras.DemoWriteRefusedException
import com.apex.athlete.core.database.entity.FoodLogEntity
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.quicklog.WriteOutcome
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class FoodModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private fun meal(
        id: String, kcal: Double? = null, p: Double? = null, c: Double? = null, f: Double? = null,
        source: FoodSource = FoodSource.MANUAL, prov: DataProvenance = DataProvenance.USER_REPORTED, at: Long = 1_000,
    ) = FoodLogEntity(id, at, MealKind.LUNCH, "m$id", kcal, p, c, f, null, source, prov)

    @Test fun totalsMacroAndBalanceComeFromTheEngine() {
        val ui = FoodDayUi.of(5, listOf(meal("1", 500.0, 30.0, 50.0, 10.0), meal("2", 300.0, 10.0, 30.0, 10.0)), EnergyBurned(2_000.0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, false))
        assertEquals(800.0, ui.totals.kcal.total)
        assertNotNull(ui.macros.split)
        assertEquals(-1_200.0, ui.balance.balanceKcal)
        assertEquals(DataProvenance.USER_REPORTED, ui.totalsProvenance)
    }

    @Test fun missingKcalOnAnyMealHidesTheBalanceAndSaysNotEnoughData() {
        val ui = FoodDayUi.of(5, listOf(meal("1", 500.0), meal("2", null)), EnergyBurned(2_000.0, DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, false))
        assertNull(ui.balance.balanceKcal)
        assertEquals(EnergyBalanceMissingReason.INTAKE_INCOMPLETE, ui.balance.missingReason)
        assertTrue(ui.totals.kcal.incomplete)
        assertTrue(balanceState(ui.balance) is MetricState.Unavailable)
    }

    @Test fun noMeasuredEnergyOrProvisionalDayHidesTheBalance() {
        val meals = listOf(meal("1", 500.0))
        assertEquals(EnergyBalanceMissingReason.NO_MEASURED_EXPENDITURE, FoodDayUi.of(5, meals, EnergyBurned.NONE).balance.missingReason)
        assertEquals(EnergyBalanceMissingReason.DAY_PROVISIONAL, FoodDayUi.of(5, meals, EnergyBurned(1_000.0, null, true)).balance.missingReason)
        assertEquals(EnergyBalanceMissingReason.NO_ENTRIES, FoodDayUi.of(5, emptyList(), EnergyBurned(1_000.0, null, false)).balance.missingReason)
    }

    @Test fun totalsOfNoValueAreMissingNotZero() {
        val ui = FoodDayUi.of(5, listOf(meal("1", 500.0)), EnergyBurned.NONE)
        assertTrue(totalState(ui.totals.proteinG, "g", ui.totalsProvenance) is MetricState.Unavailable)
        assertEquals(MacroSplitMissingReason.MACROS_INCOMPLETE, ui.macros.missingReason)
    }

    @Test fun mixedSourcesGiveADerivedTotal() {
        assertEquals(
            DataProvenance.MATHEMATICALLY_DERIVED,
            aggregateProvenance(listOf(DataProvenance.USER_REPORTED, DataProvenance.AI_INTERPRETED)),
        )
        assertEquals(DataProvenance.AI_INTERPRETED, aggregateProvenance(listOf(DataProvenance.AI_INTERPRETED)))
    }

    @Test fun macroPercentsAlwaysAddToOneHundred() {
        val (a, b, c) = macroPercents(1.0 / 3, 1.0 / 3, 1.0 / 3)
        assertEquals(100, a + b + c)
        val (x, y, z) = macroPercents(0.505, 0.305, 0.19)
        assertEquals(100, x + y + z)
    }

    @Test fun formParsingKeepsBlankAsMissingAndRejectsBadNumbers() {
        val ok = FoodForm.parse(FoodDraft(name = " Oats ", kcal = "350", protein = "12,5", carbs = ""))
        assertEquals("Oats", ok.meal?.name)
        assertEquals(12.5, ok.meal?.proteinG)
        assertNull(ok.meal?.carbsG)
        assertNull(ok.meal?.fatG)
        val bad = FoodForm.parse(FoodDraft(name = "", kcal = "-5", protein = "abc", fat = "99999"))
        assertNull(bad.meal)
        assertEquals(setOf(FoodField.NAME, FoodField.KCAL, FoodField.PROTEIN, FoodField.FAT), bad.errors)
        assertEquals(0.0, FoodForm.parse(FoodDraft(name = "Water", kcal = "0")).meal?.kcal, "a typed zero is a known zero")
    }

    @Test fun newMealOnAnotherDayIsStampedInsideThatDay() {
        val zone = ZoneId.of("Europe/Berlin")
        val day = LocalDate.of(2026, 3, 29).toEpochDay() // DST change day
        val millis = FoodForm.mealMillis(day, today = day + 3, nowMillis = 0, zone = zone)
        assertEquals(day, java.time.Instant.ofEpochMilli(millis).atZone(zone).toLocalDate().toEpochDay())
        assertEquals(77, FoodForm.mealMillis(day, day, 77, zone))
    }

    private class Log {
        val inserted = ArrayList<Pair<ParsedMeal, Long>>()
        val replaced = ArrayList<FoodLogEntity>()
        var fail: Exception? = null
    }

    private fun vm(meals: MutableStateFlow<List<FoodLogEntity>>, log: Log, handle: SavedStateHandle = SavedStateHandle()) =
        FoodViewModel(
            today = { 10L }, nowMillis = { 555L }, zone = { ZoneId.of("UTC") },
            loadMeals = { meals }, loadBurned = { flowOf(EnergyBurned.NONE) },
            insert = { m, t -> log.fail?.let { throw it }; log.inserted += m to t },
            replace = { e -> log.replaced += e }, remove = {}, handle = handle,
        ).also { v -> CoroutineScope(Dispatchers.Main).launch { v.state.collect { } } }

    @Test fun savingAddsAtNowAndClosesTheEditor() {
        val log = Log()
        val v = vm(MutableStateFlow(emptyList()), log)
        v.startAdd()
        v.save() // empty name: stays open and shows errors
        assertTrue(v.editor.value!!.showErrors)
        assertTrue(log.inserted.isEmpty())
        v.updateDraft { it.copy(name = "Toast", kcal = "200") }
        v.save()
        assertEquals(555L, log.inserted.single().second)
        assertNull(v.editor.value)
    }

    @Test fun editingKeepsIdTimeAndSource() {
        val log = Log()
        val original = meal("7", 100.0, source = FoodSource.AI_ESTIMATE, prov = DataProvenance.AI_INTERPRETED, at = 9_000)
        val v = vm(MutableStateFlow(listOf(original)), log)
        val shown = v.state.value!!.meals.single()
        v.startEdit(shown)
        v.updateDraft { it.copy(kcal = "150") }
        v.save()
        val saved = log.replaced.single()
        assertEquals("7", saved.id)
        assertEquals(9_000L, saved.epochMillis)
        assertEquals(FoodSource.AI_ESTIMATE, saved.source)
        assertEquals(150.0, saved.kcal)
    }

    @Test fun demoRefusalKeepsTheEditorOpenWithACalmOutcome() {
        val log = Log().also { it.fail = DemoWriteRefusedException() }
        val v = vm(MutableStateFlow(emptyList()), log)
        v.startAdd()
        v.updateDraft { it.copy(name = "Toast") }
        v.save()
        assertEquals(WriteOutcome.DEMO, v.outcome.value)
        assertNotNull(v.editor.value)
    }

    @Test fun previousDaysDataIsNeverShownForTheNewDay() {
        val log = Log()
        val gate = MutableStateFlow(listOf(meal("1", 100.0)))
        val v = FoodViewModel(
            today = { 10L }, nowMillis = { 0L }, zone = { ZoneId.of("UTC") },
            loadMeals = { d -> if (d == 10L) gate else MutableStateFlow(emptyList<FoodLogEntity>()).also { } },
            loadBurned = { flowOf(EnergyBurned.NONE) }, insert = { _, _ -> }, replace = {}, remove = {}, handle = SavedStateHandle(),
        ).also { x -> CoroutineScope(Dispatchers.Main).launch { x.state.collect { } } }
        assertEquals(10L, v.state.value?.day)
        v.setDay(9L)
        assertEquals(9L, v.state.value?.day)
        assertFalse(v.state.value?.meals?.isNotEmpty() == true)
        assertTrue(log.inserted.isEmpty())
    }

    @Test fun editorDraftSurvivesProcessDeath() {
        val handle = SavedStateHandle()
        vm(MutableStateFlow(emptyList()), Log(), handle).apply { startAdd(); updateDraft { it.copy(name = "Soup", kcal = "90") } }
        val again = vm(MutableStateFlow(emptyList()), Log(), handle)
        assertEquals(FoodDraft(MealKind.BREAKFAST, "Soup", "90"), again.editor.value?.draft)
    }
}
