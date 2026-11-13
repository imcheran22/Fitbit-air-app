package com.apex.athlete.ui.bloodpressure

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.analytics.bp.BloodPressure
import com.apex.athlete.core.analytics.bp.BloodPressureAverage
import com.apex.athlete.core.analytics.bp.BloodPressureCategory
import com.apex.athlete.core.analytics.bp.BloodPressureEvaluation
import com.apex.athlete.core.analytics.bp.BloodPressureMissingReason
import com.apex.athlete.core.analytics.bp.BloodPressureReading
import com.apex.athlete.core.data.extras.ExtrasLimits
import com.apex.athlete.core.database.entity.BloodPressureReadingEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ChipTone

/** One history row. A lone reading is labelled single: its category is an indication, not the guideline's average. */
data class BpRowUi(
    val id: String,
    val epochMillis: Long,
    val systolic: Int,
    val diastolic: Int,
    val pulse: Int?,
    val provenance: DataProvenance,
    val evaluation: BloodPressureEvaluation,
)

data class BpUi(
    val rows: List<BpRowUi>,
    /** Readings of the last [BpForm.AVERAGE_WINDOW_DAYS] days, averaged only when there are enough of them. */
    val average: BloodPressureAverage,
    val windowReadingCount: Int,
)

object BpForm {
    const val AVERAGE_WINDOW_DAYS = 7
    private const val DAY_MILLIS = 86_400_000L

    /** Newest first, as the repository delivers them. Values are rounded to whole mmHg, the unit the engine classifies. */
    fun ui(entities: List<BloodPressureReadingEntity>, nowMillis: Long): BpUi {
        val rows = entities.sortedByDescending { it.epochMillis }.map {
            val s = Math.round(it.systolic).toInt()
            val d = Math.round(it.diastolic).toInt()
            BpRowUi(it.id, it.epochMillis, s, d, it.pulse, it.provenance, BloodPressure.evaluate(BloodPressureReading(s, d)))
        }
        val since = nowMillis - AVERAGE_WINDOW_DAYS * DAY_MILLIS
        val window = rows.filter { it.epochMillis >= since && it.epochMillis <= nowMillis }
        return BpUi(
            rows = rows,
            average = BloodPressure.average(window.map { BloodPressureReading(it.systolic, it.diastolic) }),
            windowReadingCount = window.size,
        )
    }

    fun tone(c: BloodPressureCategory?): ChipTone = when (c) {
        null -> ChipTone.NEUTRAL
        BloodPressureCategory.NORMAL -> ChipTone.OPTIMAL
        BloodPressureCategory.ELEVATED, BloodPressureCategory.STAGE_1 -> ChipTone.WARNING
        BloodPressureCategory.STAGE_2, BloodPressureCategory.CRISIS -> ChipTone.ALERT
    }

    @StringRes
    fun categoryRes(c: BloodPressureCategory): Int = when (c) {
        BloodPressureCategory.NORMAL -> R.string.bp_cat_normal
        BloodPressureCategory.ELEVATED -> R.string.bp_cat_elevated
        BloodPressureCategory.STAGE_1 -> R.string.bp_cat_stage1
        BloodPressureCategory.STAGE_2 -> R.string.bp_cat_stage2
        BloodPressureCategory.CRISIS -> R.string.bp_cat_crisis
    }

    @StringRes
    fun missingRes(r: BloodPressureMissingReason?): Int? = when (r) {
        null -> null
        BloodPressureMissingReason.IMPLAUSIBLE_READING -> R.string.bp_reason_implausible
        BloodPressureMissingReason.INSUFFICIENT_READINGS -> R.string.bp_reason_insufficient
    }
}

enum class BpField { SYSTOLIC, DIASTOLIC, PULSE, ORDER }

data class BpDraft(val systolic: String = "", val diastolic: String = "", val pulse: String = "")

data class ParsedBp(val systolic: Int, val diastolic: Int, val pulse: Int?)

/** [reading] is set only when [errors] is empty. A blank pulse is missing, not an error. */
data class BpParse(val reading: ParsedBp?, val errors: Set<BpField>)

object BpEntry {
    fun sanitize(raw: String): String = raw.filter { it.isDigit() }.take(3)

    fun parse(d: BpDraft): BpParse {
        val errors = LinkedHashSet<BpField>()
        val s = d.systolic.trim().toIntOrNull()?.takeIf { it.toDouble() in ExtrasLimits.SYSTOLIC_MIN..ExtrasLimits.SYSTOLIC_MAX }
        val dia = d.diastolic.trim().toIntOrNull()?.takeIf { it.toDouble() in ExtrasLimits.DIASTOLIC_MIN..ExtrasLimits.DIASTOLIC_MAX }
        val pulseText = d.pulse.trim()
        val pulse = pulseText.toIntOrNull()?.takeIf { it in ExtrasLimits.PULSE_MIN..ExtrasLimits.PULSE_MAX }
        if (s == null) errors += BpField.SYSTOLIC
        if (dia == null) errors += BpField.DIASTOLIC
        if (pulseText.isNotEmpty() && pulse == null) errors += BpField.PULSE
        if (s != null && dia != null && dia >= s) errors += BpField.ORDER
        return if (errors.isEmpty()) BpParse(ParsedBp(s!!, dia!!, pulse), emptySet()) else BpParse(null, errors)
    }
}
