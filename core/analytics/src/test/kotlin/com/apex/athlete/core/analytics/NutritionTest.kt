package com.apex.athlete.core.analytics

import com.apex.athlete.core.analytics.nutrition.CalorieTargetMissingReason
import com.apex.athlete.core.analytics.nutrition.EnergyBalanceMissingReason
import com.apex.athlete.core.analytics.nutrition.MacroSplitMissingReason
import com.apex.athlete.core.analytics.nutrition.NutrientMissingReason
import com.apex.athlete.core.analytics.nutrition.NutritionEngine
import com.apex.athlete.core.analytics.nutrition.NutritionEntry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NutritionTest {

    private fun e(kcal: Double? = null, p: Double? = null, c: Double? = null, f: Double? = null, fibre: Double? = null) =
        NutritionEntry(kcal, p, c, f, fibre)

    private val complete = listOf(e(500.0, 30.0, 60.0, 15.0, 5.0), e(400.0, 25.0, 50.0, 10.0, 8.0))
    private val partial = listOf(e(500.0, 30.0, 60.0, 15.0, 5.0), e(300.0, null, 40.0, 10.0, null))

    @Test
    fun totalsSumKnownValuesAndFlagIncompleteFields() {
        val t = NutritionEngine.dailyTotals(partial)
        assertEquals(2, t.entryCount)
        assertEquals(800.0, t.kcal.total!!, 0.0); assertFalse(t.kcal.incomplete)
        assertEquals(30.0, t.proteinG.total!!, 0.0); assertTrue(t.proteinG.incomplete) // 30 is a lower bound, not the total
        assertEquals(100.0, t.carbsG.total!!, 0.0); assertFalse(t.carbsG.incomplete)
        assertEquals(25.0, t.fatG.total!!, 0.0); assertFalse(t.fatG.incomplete)
        assertEquals(5.0, t.fibreG.total!!, 0.0); assertTrue(t.fibreG.incomplete)
    }

    @Test
    fun fieldWithNoKnownValueIsNullNotZero() {
        val t = NutritionEngine.dailyTotals(listOf(e(kcal = 300.0), e(kcal = 200.0)))
        assertEquals(500.0, t.kcal.total!!, 0.0)
        assertNull(t.proteinG.total)
        assertTrue(t.proteinG.incomplete)
        assertEquals(NutrientMissingReason.NOT_LOGGED_IN_ANY_ENTRY, t.proteinG.missingReason)
    }

    @Test
    fun noEntriesIsMissingNotZero() {
        val t = NutritionEngine.dailyTotals(emptyList())
        assertEquals(0, t.entryCount)
        assertNull(t.kcal.total)
        assertFalse(t.kcal.incomplete)
        assertEquals(NutrientMissingReason.NO_ENTRIES, t.kcal.missingReason)
    }

    @Test
    fun negativeOrNonFiniteValuesCountAsUnknown() {
        val t = NutritionEngine.dailyTotals(listOf(e(kcal = 300.0), e(kcal = -50.0), e(kcal = Double.NaN)))
        assertEquals(300.0, t.kcal.total!!, 0.0)
        assertTrue(t.kcal.incomplete)
        // A logged zero (water, black coffee) is a known value.
        val z = NutritionEngine.dailyTotals(listOf(e(kcal = 0.0), e(kcal = 120.0)))
        assertEquals(120.0, z.kcal.total!!, 0.0)
        assertFalse(z.kcal.incomplete)
    }

    @Test
    fun macroEnergySplitUsesFourFourNine() {
        val t = NutritionEngine.dailyTotals(complete) // protein 55 g, carbs 110 g, fat 25 g
        val m = NutritionEngine.macroSplit(t)!!.let { it }
        assertEquals(220.0, m.proteinKcal, 1e-12)
        assertEquals(440.0, m.carbsKcal, 1e-12)
        assertEquals(225.0, m.fatKcal, 1e-12)
        assertEquals(885.0, m.totalKcal, 1e-12)
        assertEquals(220.0 / 885.0, m.proteinShare, 1e-12)
        assertEquals(440.0 / 885.0, m.carbsShare, 1e-12)
        assertEquals(225.0 / 885.0, m.fatShare, 1e-12)
        assertEquals(1.0, m.proteinShare + m.carbsShare + m.fatShare, 1e-12)
    }

    @Test
    fun macroSplitIsNullWhenAnyMacroIsIncompleteOrAbsent() {
        val r = NutritionEngine.macroSplitResult(NutritionEngine.dailyTotals(partial))
        assertNull(r.split)
        assertEquals(MacroSplitMissingReason.MACROS_INCOMPLETE, r.missingReason)
        assertEquals(MacroSplitMissingReason.NO_ENTRIES, NutritionEngine.macroSplitResult(NutritionEngine.dailyTotals(emptyList())).missingReason)
        // All macros logged as zero: no energy to divide, so no shares (not 0 %).
        val zero = NutritionEngine.macroSplitResult(NutritionEngine.dailyTotals(listOf(e(0.0, 0.0, 0.0, 0.0))))
        assertNull(zero.split)
        assertEquals(MacroSplitMissingReason.NO_MACRO_ENERGY, zero.missingReason)
    }

    @Test
    fun energyBalanceIsIntakeMinusMeasuredExpenditure() {
        val t = NutritionEngine.dailyTotals(complete) // 900 kcal
        val b = NutritionEngine.energyBalance(t, measuredTotalEnergyKcal = 2400.0, dayIsProvisional = false)
        assertEquals(-1500.0, b.balanceKcal!!, 1e-12)
        assertNull(b.missingReason)
    }

    @Test
    fun energyBalanceNeedsNonEmptyCompleteIntakeAndAMeasuredFinishedDay() {
        val full = NutritionEngine.dailyTotals(complete)
        assertEquals(EnergyBalanceMissingReason.NO_ENTRIES,
            NutritionEngine.energyBalance(NutritionEngine.dailyTotals(emptyList()), 2400.0, false).missingReason)
        assertEquals(EnergyBalanceMissingReason.INTAKE_INCOMPLETE,
            NutritionEngine.energyBalance(NutritionEngine.dailyTotals(listOf(e(500.0), e(null, 10.0))), 2400.0, false).missingReason)
        assertEquals(EnergyBalanceMissingReason.INTAKE_INCOMPLETE,
            NutritionEngine.energyBalance(NutritionEngine.dailyTotals(listOf(e(null, 10.0))), 2400.0, false).missingReason)
        assertEquals(EnergyBalanceMissingReason.DAY_PROVISIONAL, NutritionEngine.energyBalance(full, 2400.0, true).missingReason)
        assertEquals(EnergyBalanceMissingReason.NO_MEASURED_EXPENDITURE, NutritionEngine.energyBalance(full, null, false).missingReason)
        assertEquals(EnergyBalanceMissingReason.NO_MEASURED_EXPENDITURE, NutritionEngine.energyBalance(full, 0.0, false).missingReason)
        assertEquals(EnergyBalanceMissingReason.NO_MEASURED_EXPENDITURE, NutritionEngine.energyBalance(full, Double.NaN, false).missingReason)
        assertNull(NutritionEngine.energyBalance(full, null, false).balanceKcal)
    }

    @Test
    fun calorieTargetProgressUsesTheUsersTargetOnly() {
        val t = NutritionEngine.dailyTotals(complete) // 900 kcal
        val p = NutritionEngine.calorieTargetProgress(t, targetKcal = 2000.0)
        assertEquals(0.45, p.fraction!!, 1e-12)
        assertEquals(1100.0, p.remainingKcal!!, 1e-12)
        assertFalse(p.intakeIsLowerBound)
        // Over target: fraction above 1 and a negative remainder.
        val over = NutritionEngine.calorieTargetProgress(t, targetKcal = 800.0)
        assertEquals(1.125, over.fraction!!, 1e-12)
        assertEquals(-100.0, over.remainingKcal!!, 1e-12)
        // Incomplete intake is a lower bound.
        val lb = NutritionEngine.calorieTargetProgress(NutritionEngine.dailyTotals(listOf(e(500.0), e(null, 10.0))), 2000.0)
        assertEquals(0.25, lb.fraction!!, 1e-12)
        assertTrue(lb.intakeIsLowerBound)
    }

    @Test
    fun noTargetNoDefault() {
        val t = NutritionEngine.dailyTotals(complete)
        for (target in listOf(null, 0.0, -100.0, Double.NaN)) {
            val p = NutritionEngine.calorieTargetProgress(t, target)
            assertNull(p.fraction)
            assertEquals(CalorieTargetMissingReason.TARGET_NOT_SET, p.missingReason)
        }
        val none = NutritionEngine.calorieTargetProgress(NutritionEngine.dailyTotals(emptyList()), 2000.0)
        assertEquals(CalorieTargetMissingReason.NO_INTAKE, none.missingReason)
        assertNull(none.remainingKcal)
    }
}
