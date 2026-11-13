package com.apex.athlete.ui.healthage

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.analytics.healthage.ContributionDirection
import com.apex.athlete.core.analytics.healthage.FactorContribution
import com.apex.athlete.core.analytics.healthage.HealthAge
import com.apex.athlete.core.analytics.healthage.HealthAgeConfidence
import com.apex.athlete.core.analytics.healthage.HealthAgeFactor
import com.apex.athlete.core.analytics.healthage.HealthAgeNoDataReason
import com.apex.athlete.core.analytics.healthage.HealthAgeResult
import com.apex.athlete.core.analytics.healthage.NotEnoughDataReason
import com.apex.athlete.core.analytics.healthage.WithheldReason
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.state.MetricState
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

/** What the screens wait for, show, or could not compute. [Off] is the switch in Settings; nothing is read then. */
sealed interface HealthAgeLoad {
    /** The setting has not been read yet. */
    data object Pending : HealthAgeLoad
    data object Off : HealthAgeLoad
    data object Loading : HealthAgeLoad
    data object Failed : HealthAgeLoad
    data class Ready(val result: HealthAgeResult, val isDemo: Boolean) : HealthAgeLoad
}

enum class AgeDirection { OLDER, YOUNGER, SAME }

data class FactorUi(
    @StringRes val nameRes: Int,
    /** The factor's window value with the Calculated provenance; the unit is added by the screen from [unitRes]. */
    val value: MetricState.Value,
    @StringRes val unitRes: Int?,
    val days: Int,
    val years: Double,
    val yearsText: String,
    val direction: AgeDirection,
    val capped: Boolean,
)

data class WithheldUi(@StringRes val nameRes: Int, @StringRes val reasonRes: Int)

/** The screen model of the health-age result; one subtype per result type plus the non-result states. */
sealed interface HealthAgeUi {
    data object Pending : HealthAgeUi
    data object Off : HealthAgeUi
    data object Loading : HealthAgeUi
    data object Failed : HealthAgeUi

    data class NoData(@StringRes val reasonRes: Int) : HealthAgeUi

    data class NotEnough(
        @StringRes val reasonRes: Int,
        val scoredDaySeriesFactors: Int,
        val withheld: List<WithheldUi>,
    ) : HealthAgeUi

    data class Estimate(
        val isDemo: Boolean,
        /** Estimated age in years with the Estimated provenance (1 decimal). */
        val age: MetricState.Value,
        val chronologicalAge: Int,
        val deltaYears: Double,
        val deltaText: String,
        val direction: AgeDirection,
        val totalCapped: Boolean,
        @StringRes val confidenceRes: Int,
        val factors: List<FactorUi>,
        val withheld: List<WithheldUi>,
        val disclaimer: String,
    ) : HealthAgeUi
}

private const val YEARS_DECIMALS = 1

/** Signed years text, "+1.4" or "−0.6" (a real minus sign); zero after rounding is "0.0". */
fun signedYears(years: Double, locale: Locale = Locale.getDefault()): String {
    val text = MetricFormat.number(years, YEARS_DECIMALS, locale)
    return if (years > 0.0 && !isZeroAfterRounding(years)) "${MetricFormat.PLUS}$text" else text
}

/** Rounds to one decimal the way the text shows it, so the direction word never disagrees with the digits. */
fun roundYears(years: Double): Double = (years * 10.0).roundToLong() / 10.0

private fun isZeroAfterRounding(years: Double) = abs(roundYears(years)) < 0.05

private fun directionOf(rounded: Double): AgeDirection = when {
    rounded > 0.0 -> AgeDirection.OLDER
    rounded < 0.0 -> AgeDirection.YOUNGER
    else -> AgeDirection.SAME
}

@StringRes
fun factorNameRes(f: HealthAgeFactor): Int = when (f) {
    HealthAgeFactor.VO2_MAX -> R.string.healthage_factor_vo2
    HealthAgeFactor.RESTING_HEART_RATE -> R.string.healthage_factor_rhr
    HealthAgeFactor.HRV -> R.string.healthage_factor_hrv
    HealthAgeFactor.SLEEP_DURATION -> R.string.healthage_factor_sleep
    HealthAgeFactor.SLEEP_REGULARITY -> R.string.healthage_factor_regularity
    HealthAgeFactor.DAILY_STEPS -> R.string.healthage_factor_steps
    HealthAgeFactor.BMI -> R.string.healthage_factor_bmi
}

@StringRes
fun withheldReasonRes(r: WithheldReason): Int = when (r) {
    WithheldReason.MISSING -> R.string.healthage_withheld_missing
    WithheldReason.INSUFFICIENT_DAYS -> R.string.healthage_withheld_days
    WithheldReason.INVALID_VALUE -> R.string.healthage_withheld_invalid
    WithheldReason.SEX_UNSPECIFIED -> R.string.healthage_withheld_sex
    WithheldReason.AGE_OUT_OF_RANGE -> R.string.healthage_withheld_age
    WithheldReason.DERIVED_FROM_RESTING_HR -> R.string.healthage_withheld_derived
    WithheldReason.NO_VALIDATED_NORM -> R.string.healthage_withheld_norm
}

@StringRes
fun notEnoughReasonRes(r: NotEnoughDataReason): Int = when (r) {
    NotEnoughDataReason.NEED_VO2_MAX_OR_THREE_FACTORS -> R.string.healthage_notenough_reason
}

@StringRes
fun noDataReasonRes(r: HealthAgeNoDataReason): Int = when (r) {
    HealthAgeNoDataReason.NO_AGE -> R.string.healthage_nodata_no_age
    HealthAgeNoDataReason.AGE_OUT_OF_RANGE -> R.string.healthage_nodata_age_range
}

@StringRes
fun confidenceRes(c: HealthAgeConfidence): Int = when (c) {
    HealthAgeConfidence.LOW -> R.string.healthage_confidence_low
    HealthAgeConfidence.MODERATE -> R.string.healthage_confidence_moderate
    HealthAgeConfidence.HIGH -> R.string.healthage_confidence_high
}

@StringRes
fun directionRes(d: AgeDirection): Int = when (d) {
    AgeDirection.OLDER -> R.string.healthage_dir_older
    AgeDirection.YOUNGER -> R.string.healthage_dir_younger
    AgeDirection.SAME -> R.string.healthage_dir_same
}

private data class Display(@StringRes val unitRes: Int?, val decimals: Int, val scale: Double)

private fun displayOf(f: HealthAgeFactor): Display = when (f) {
    HealthAgeFactor.VO2_MAX -> Display(R.string.healthage_unit_vo2, 1, 1.0)
    HealthAgeFactor.RESTING_HEART_RATE -> Display(R.string.healthage_unit_bpm, 0, 1.0)
    HealthAgeFactor.HRV -> Display(R.string.healthage_unit_ms, 0, 1.0)
    HealthAgeFactor.SLEEP_DURATION -> Display(R.string.healthage_unit_hours, 1, 1.0 / 60.0) // minutes in, hours shown
    HealthAgeFactor.SLEEP_REGULARITY -> Display(null, 0, 1.0)
    HealthAgeFactor.DAILY_STEPS -> Display(R.string.healthage_unit_steps, 0, 1.0)
    HealthAgeFactor.BMI -> Display(R.string.healthage_unit_bmi, 1, 1.0)
}

private fun FactorContribution.toUi(): FactorUi {
    val d = displayOf(factor)
    val rounded = roundYears(years)
    return FactorUi(
        nameRes = factorNameRes(factor),
        value = MetricState.Value(
            value = value * d.scale,
            decimals = d.decimals,
            unit = null,
            provenance = DataProvenance.MATHEMATICALLY_DERIVED,
        ),
        unitRes = d.unitRes,
        days = daysOfData,
        years = rounded,
        yearsText = signedYears(years),
        direction = directionOf(rounded),
        capped = capped,
    )
}

/** Maps the load state to the screen model. Pure: all wording is a string resource id or an engine constant. */
fun buildHealthAgeUi(load: HealthAgeLoad): HealthAgeUi = when (load) {
    HealthAgeLoad.Pending -> HealthAgeUi.Pending
    HealthAgeLoad.Off -> HealthAgeUi.Off
    HealthAgeLoad.Loading -> HealthAgeUi.Loading
    HealthAgeLoad.Failed -> HealthAgeUi.Failed
    is HealthAgeLoad.Ready -> when (val r = load.result) {
        is HealthAgeResult.NoData -> HealthAgeUi.NoData(noDataReasonRes(r.reason))
        is HealthAgeResult.NotEnoughData -> HealthAgeUi.NotEnough(
            reasonRes = notEnoughReasonRes(r.reasons.firstOrNull() ?: NotEnoughDataReason.NEED_VO2_MAX_OR_THREE_FACTORS),
            scoredDaySeriesFactors = r.scoredDaySeriesFactors,
            withheld = r.withheld.map { WithheldUi(factorNameRes(it.factor), withheldReasonRes(it.reason)) },
        )
        is HealthAgeResult.Estimate -> {
            val delta = roundYears(r.deltaYears)
            HealthAgeUi.Estimate(
                isDemo = load.isDemo,
                age = MetricState.Value(
                    value = r.estimatedAgeYears,
                    decimals = YEARS_DECIMALS,
                    unit = null,
                    provenance = r.provenance,
                ),
                chronologicalAge = r.chronologicalAgeYears,
                deltaYears = delta,
                deltaText = signedYears(r.deltaYears),
                direction = directionOf(delta),
                totalCapped = r.totalCapped,
                confidenceRes = confidenceRes(r.confidence),
                factors = r.contributions.map { it.toUi() },
                withheld = r.withheld.map { WithheldUi(factorNameRes(it.factor), withheldReasonRes(it.reason)) },
                disclaimer = r.disclaimer.ifBlank { HealthAge.DISCLAIMER },
            )
        }
    }
}
