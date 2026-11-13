package com.apex.athlete.ui.food

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.analytics.nutrition.DailyNutrition
import com.apex.athlete.core.analytics.nutrition.EnergyBalance
import com.apex.athlete.core.analytics.nutrition.EnergyBalanceMissingReason
import com.apex.athlete.core.analytics.nutrition.MacroSplitMissingReason
import com.apex.athlete.core.analytics.nutrition.MacroSplitResult
import com.apex.athlete.core.analytics.nutrition.NutrientTotal
import com.apex.athlete.core.analytics.nutrition.NutritionEngine
import com.apex.athlete.core.analytics.nutrition.NutritionEntry
import com.apex.athlete.core.data.extras.ExtrasLimits
import com.apex.athlete.core.database.entity.FoodLogEntity
import com.apex.athlete.core.database.entity.FoodSource
import com.apex.athlete.core.database.entity.MealKind
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import java.time.LocalDate
import java.time.ZoneId

/** Measured energy burned for the day from the repository; [kcal] null = none measured (never zero). */
data class EnergyBurned(val kcal: Double?, val provenance: DataProvenance?, val provisional: Boolean) {
    companion object {
        val NONE = EnergyBurned(null, null, false)
    }
}

data class MealUi(
    val id: String,
    val name: String,
    val mealKind: MealKind,
    val epochMillis: Long,
    val kcal: Double?,
    val proteinG: Double?,
    val carbsG: Double?,
    val fatG: Double?,
    val fibreG: Double?,
    val provenance: DataProvenance,
    val source: FoodSource,
)

/** Everything the food screen shows for one day, computed by [NutritionEngine] and never invented. */
data class FoodDayUi(
    val day: Long,
    val meals: List<MealUi>,
    val totals: DailyNutrition,
    val totalsProvenance: DataProvenance,
    val macros: MacroSplitResult,
    val burned: EnergyBurned,
    val balance: EnergyBalance,
) {
    companion object {
        fun of(day: Long, entries: List<FoodLogEntity>, burned: EnergyBurned): FoodDayUi {
            val meals = entries.sortedBy { it.epochMillis }.map {
                MealUi(it.id, it.name, it.mealKind, it.epochMillis, it.kcal, it.proteinG, it.carbsG, it.fatG, it.fibreG, it.provenance, it.source)
            }
            val totals = NutritionEngine.dailyTotals(entries.map { NutritionEntry(it.kcal, it.proteinG, it.carbsG, it.fatG, it.fibreG) })
            return FoodDayUi(
                day = day,
                meals = meals,
                totals = totals,
                totalsProvenance = aggregateProvenance(meals.map { it.provenance }),
                macros = NutritionEngine.macroSplitResult(totals),
                burned = burned,
                balance = NutritionEngine.energyBalance(totals, burned.kcal, burned.provisional),
            )
        }
    }
}

/** One source: that source. A mix (for example typed meals and an AI estimate): the total is a derived sum. */
fun aggregateProvenance(list: List<DataProvenance>): DataProvenance {
    val distinct = list.distinct()
    return if (distinct.size == 1) distinct.first() else DataProvenance.MATHEMATICALLY_DERIVED
}

/** A nutrient total as a metric state; no entry with the value = `--`, never 0. */
fun totalState(total: NutrientTotal, unit: String, provenance: DataProvenance): MetricState =
    total.total?.let { MetricState.Value(it, 0, unit, provenance) } ?: MetricState.Unavailable(MetricReason.NO_DATA)

/** Energy balance (intake minus measured energy burned); null result = not enough data, with [balanceReasonRes]. */
fun balanceState(balance: EnergyBalance): MetricState =
    balance.balanceKcal?.let { MetricState.Value(it, 0, "kcal", DataProvenance.MATHEMATICALLY_DERIVED) }
        ?: MetricState.Unavailable(MetricReason.NO_DATA)

@StringRes
fun balanceReasonRes(reason: EnergyBalanceMissingReason?): Int? = when (reason) {
    null -> null
    EnergyBalanceMissingReason.NO_ENTRIES -> R.string.food_balance_no_entries
    EnergyBalanceMissingReason.INTAKE_INCOMPLETE -> R.string.food_balance_intake_incomplete
    EnergyBalanceMissingReason.DAY_PROVISIONAL -> R.string.food_balance_provisional
    EnergyBalanceMissingReason.NO_MEASURED_EXPENDITURE -> R.string.food_balance_no_burn
}

@StringRes
fun macroReasonRes(reason: MacroSplitMissingReason?): Int? = when (reason) {
    null -> null
    MacroSplitMissingReason.NO_ENTRIES -> R.string.food_macros_no_entries
    MacroSplitMissingReason.MACROS_INCOMPLETE -> R.string.food_macros_incomplete
    MacroSplitMissingReason.NO_MACRO_ENERGY -> R.string.food_macros_no_energy
}

/** Whole-percent shares that add to 100 (largest remainder), so the labels never read 99 or 101. */
fun macroPercents(protein: Double, carbs: Double, fat: Double): Triple<Int, Int, Int> {
    val shares = doubleArrayOf(protein, carbs, fat)
    val floors = IntArray(3) { Math.floor(shares[it] * 100.0).toInt() }
    var left = 100 - floors.sum()
    val order = (0..2).sortedByDescending { shares[it] * 100.0 - floors[it] }
    for (i in order) {
        if (left <= 0) break
        floors[i]++
        left--
    }
    return Triple(floors[0], floors[1], floors[2])
}

/** The form: every field as typed. Blank nutrients are left out (missing), not zero. */
data class FoodDraft(
    val mealKind: MealKind = MealKind.BREAKFAST,
    val name: String = "",
    val kcal: String = "",
    val protein: String = "",
    val carbs: String = "",
    val fat: String = "",
    val fibre: String = "",
)

enum class FoodField { NAME, KCAL, PROTEIN, CARBS, FAT, FIBRE }

data class ParsedMeal(
    val mealKind: MealKind,
    val name: String,
    val kcal: Double?,
    val proteinG: Double?,
    val carbsG: Double?,
    val fatG: Double?,
    val fibreG: Double?,
)

/** [meal] is set only when [errors] is empty. */
data class FoodParse(val meal: ParsedMeal?, val errors: Set<FoodField>)

object FoodForm {
    const val MAX_NAME_CHARS: Int = ExtrasLimits.MAX_LABEL_CHARS
    const val MAX_KCAL = 20_000.0
    const val MAX_GRAMS = 2_000.0

    /** Blank = null (not logged). Comma or dot decimal. Invalid, negative or past [max] = not a value (null with [bad] true). */
    private fun number(raw: String, max: Double): Pair<Double?, Boolean> {
        val t = raw.trim().replace(',', '.')
        if (t.isEmpty()) return null to false
        val v = t.toDoubleOrNull()
        return if (v == null || !v.isFinite() || v < 0.0 || v > max) null to true else v to false
    }

    fun parse(d: FoodDraft): FoodParse {
        val errors = LinkedHashSet<FoodField>()
        val name = d.name.trim()
        if (name.isEmpty() || name.length > MAX_NAME_CHARS) errors += FoodField.NAME
        fun n(raw: String, max: Double, field: FoodField): Double? {
            val (v, bad) = number(raw, max)
            if (bad) errors += field
            return v
        }
        val kcal = n(d.kcal, MAX_KCAL, FoodField.KCAL)
        val p = n(d.protein, MAX_GRAMS, FoodField.PROTEIN)
        val c = n(d.carbs, MAX_GRAMS, FoodField.CARBS)
        val f = n(d.fat, MAX_GRAMS, FoodField.FAT)
        val fi = n(d.fibre, MAX_GRAMS, FoodField.FIBRE)
        return if (errors.isEmpty()) FoodParse(ParsedMeal(d.mealKind, name, kcal, p, c, f, fi), emptySet()) else FoodParse(null, errors)
    }

    fun draftOf(m: MealUi): FoodDraft = FoodDraft(
        mealKind = m.mealKind,
        name = m.name,
        kcal = m.kcal.asField(),
        protein = m.proteinG.asField(),
        carbs = m.carbsG.asField(),
        fat = m.fatG.asField(),
        fibre = m.fibreG.asField(),
    )

    private fun Double?.asField(): String = when {
        this == null -> ""
        this == Math.rint(this) -> toLong().toString()
        else -> toString()
    }

    /** New meals today are stamped now; on another day they get midday, so they sit inside that civil day. */
    fun mealMillis(day: Long, today: Long, nowMillis: Long, zone: ZoneId): Long =
        if (day == today) nowMillis else LocalDate.ofEpochDay(day).atStartOfDay(zone).plusHours(12).toInstant().toEpochMilli()
}
