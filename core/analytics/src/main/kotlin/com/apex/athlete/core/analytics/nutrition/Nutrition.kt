package com.apex.athlete.core.analytics.nutrition

/** One logged food or meal. Null = not known for this entry (not logged); 0.0 is a known zero. Negative or non-finite is treated as unknown. */
data class NutritionEntry(
    val kcal: Double?,
    val proteinG: Double?,
    val carbsG: Double?,
    val fatG: Double?,
    val fibreG: Double?,
)

enum class NutrientMissingReason {
    NO_ENTRIES,
    /** Entries exist but none of them has this field. */
    NOT_LOGGED_IN_ANY_ENTRY,
}

/**
 * @property total sum of the known values only. Null when no entry has a known value (never 0 in that case).
 * @property incomplete true when at least one entry lacks this field, so [total] is a lower bound of the real total.
 */
data class NutrientTotal(val total: Double?, val incomplete: Boolean, val missingReason: NutrientMissingReason?)

data class DailyNutrition(
    val entryCount: Int,
    val kcal: NutrientTotal,
    val proteinG: NutrientTotal,
    val carbsG: NutrientTotal,
    val fatG: NutrientTotal,
    val fibreG: NutrientTotal,
)

/** Energy from the three macronutrients by the 4/4/9 factors, and each one's share of that sum. */
data class MacroSplit(
    val proteinKcal: Double,
    val carbsKcal: Double,
    val fatKcal: Double,
    val totalKcal: Double,
    val proteinShare: Double,
    val carbsShare: Double,
    val fatShare: Double,
)

enum class MacroSplitMissingReason { NO_ENTRIES, MACROS_INCOMPLETE, NO_MACRO_ENERGY }
data class MacroSplitResult(val split: MacroSplit?, val missingReason: MacroSplitMissingReason?)

enum class EnergyBalanceMissingReason { NO_ENTRIES, INTAKE_INCOMPLETE, DAY_PROVISIONAL, NO_MEASURED_EXPENDITURE }
data class EnergyBalance(val balanceKcal: Double?, val missingReason: EnergyBalanceMissingReason?)

enum class CalorieTargetMissingReason { TARGET_NOT_SET, NO_INTAKE }

/**
 * @property fraction intake / target, not capped.
 * @property remainingKcal target minus intake; negative when over.
 * @property intakeIsLowerBound true when some entry lacks calories, so the real intake is at least the number shown.
 */
data class CalorieTargetProgress(
    val fraction: Double?,
    val remainingKcal: Double?,
    val intakeIsLowerBound: Boolean,
    val missingReason: CalorieTargetMissingReason?,
)

/**
 * Food-log arithmetic. No food database, no recommended intake, no default target.
 *
 *  - Totals add the known values of each field separately. A field that some entry lacks is flagged incomplete; a field no entry has
 *    is null. A null is never added as 0.
 *  - Macro split: protein, carbohydrate and fat grams times [KCAL_PER_G_PROTEIN] = 4, [KCAL_PER_G_CARBS] = 4 and [KCAL_PER_G_FAT] = 9
 *    kcal/g, each as a share of the sum of the three. These are the Atwater general factors (Atwater and Bryant, 1900; recalled, UNVERIFIED).
 *    Caveat: they are rounded averages. Real foods differ (fibre is closer to 2 kcal/g, alcohol, sugar alcohols and some fats are not
 *    covered), and food labels may use specific factors, so this sum does not equal the logged kcal and the shares describe the
 *    macronutrient grams, not the labelled energy. The split needs all three macros complete, otherwise it is null.
 *  - Energy balance = logged intake minus measured total energy expenditure of the same day. Only when the log is non-empty AND its
 *    kcal is complete AND a measured expenditure exists AND the day is not provisional. The expenditure is a wearable estimate with
 *    an error of the order of 10 % or more (recalled, unverified), so the balance is context, not a weight prediction.
 *  - Calorie target: the user's own number. There is no default.
 */
object NutritionEngine {
    const val KCAL_PER_G_PROTEIN: Double = 4.0
    const val KCAL_PER_G_CARBS: Double = 4.0
    const val KCAL_PER_G_FAT: Double = 9.0

    fun dailyTotals(entries: List<NutritionEntry>): DailyNutrition = DailyNutrition(
        entryCount = entries.size,
        kcal = total(entries.map { it.kcal }),
        proteinG = total(entries.map { it.proteinG }),
        carbsG = total(entries.map { it.carbsG }),
        fatG = total(entries.map { it.fatG }),
        fibreG = total(entries.map { it.fibreG }),
    )

    private fun total(values: List<Double?>): NutrientTotal {
        if (values.isEmpty()) return NutrientTotal(null, false, NutrientMissingReason.NO_ENTRIES)
        val known = values.filter { it != null && it.isFinite() && it >= 0.0 }.map { it!! }
        val incomplete = known.size < values.size
        return if (known.isEmpty()) NutrientTotal(null, true, NutrientMissingReason.NOT_LOGGED_IN_ANY_ENTRY)
        else NutrientTotal(known.sum(), incomplete, null)
    }

    fun macroSplit(totals: DailyNutrition): MacroSplit? = macroSplitResult(totals).split

    fun macroSplitResult(totals: DailyNutrition): MacroSplitResult {
        if (totals.entryCount == 0) return MacroSplitResult(null, MacroSplitMissingReason.NO_ENTRIES)
        val macros = listOf(totals.proteinG, totals.carbsG, totals.fatG)
        if (macros.any { it.total == null || it.incomplete }) return MacroSplitResult(null, MacroSplitMissingReason.MACROS_INCOMPLETE)
        val p = totals.proteinG.total!! * KCAL_PER_G_PROTEIN
        val c = totals.carbsG.total!! * KCAL_PER_G_CARBS
        val f = totals.fatG.total!! * KCAL_PER_G_FAT
        val sum = p + c + f
        if (sum <= 0.0) return MacroSplitResult(null, MacroSplitMissingReason.NO_MACRO_ENERGY)
        return MacroSplitResult(MacroSplit(p, c, f, sum, p / sum, c / sum, f / sum), null)
    }

    fun energyBalance(totals: DailyNutrition, measuredTotalEnergyKcal: Double?, dayIsProvisional: Boolean): EnergyBalance {
        if (totals.entryCount == 0) return EnergyBalance(null, EnergyBalanceMissingReason.NO_ENTRIES)
        val intake = totals.kcal.total
        if (intake == null || totals.kcal.incomplete) return EnergyBalance(null, EnergyBalanceMissingReason.INTAKE_INCOMPLETE)
        if (dayIsProvisional) return EnergyBalance(null, EnergyBalanceMissingReason.DAY_PROVISIONAL)
        val tee = measuredTotalEnergyKcal?.takeIf { it.isFinite() && it > 0.0 }
            ?: return EnergyBalance(null, EnergyBalanceMissingReason.NO_MEASURED_EXPENDITURE)
        return EnergyBalance(intake - tee, null)
    }

    /** [targetKcal] is the user's own target; null, zero, negative or non-finite means "not set" and no number is invented. */
    fun calorieTargetProgress(totals: DailyNutrition, targetKcal: Double?): CalorieTargetProgress {
        val target = targetKcal?.takeIf { it.isFinite() && it > 0.0 }
            ?: return CalorieTargetProgress(null, null, false, CalorieTargetMissingReason.TARGET_NOT_SET)
        val intake = totals.kcal.total ?: return CalorieTargetProgress(null, null, false, CalorieTargetMissingReason.NO_INTAKE)
        return CalorieTargetProgress(intake / target, target - intake, totals.kcal.incomplete, null)
    }
}
