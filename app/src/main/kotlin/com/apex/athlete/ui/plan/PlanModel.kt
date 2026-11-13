package com.apex.athlete.ui.plan

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.analytics.load.WorkloadZone
import com.apex.athlete.core.analytics.plan.NoPlanReason
import com.apex.athlete.core.analytics.plan.PlanAdjustment
import com.apex.athlete.core.analytics.plan.PlanConfidence
import com.apex.athlete.core.analytics.plan.PlanLowConfidenceReason
import com.apex.athlete.core.analytics.plan.StrainBand
import com.apex.athlete.core.analytics.plan.WeeklyPlanEngine
import com.apex.athlete.core.analytics.plan.WeeklyPlanInput
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState

/** What the plan is built from: today's analysis, reduced to the five inputs the engine takes. Null fields are unknown. */
data class PlanSource(
    val personalStrainBase: Double?,
    val todayRecovery: Double?,
    val loadZone: WorkloadZone?,
    val loadCalibrating: Boolean,
    val sleepNeedMinutes: Double?,
)

/** The one-line reason under a day: a rule that changed the day, or the plain pattern for its band. */
sealed interface PlanReason {
    data class Adjusted(val adjustment: PlanAdjustment) : PlanReason
    data class Pattern(val band: StrainBand) : PlanReason
}

data class PlanDayUi(
    val epochDay: Long,
    val band: StrainBand,
    /** Suggested centre of the day's strain (0 to 21): derived from your own recent strain, a suggestion not a target to hit. */
    val strainCentre: MetricState,
    val reason: PlanReason,
)

sealed interface PlanUi {
    data object Loading : PlanUi
    data class NoPlan(val reason: NoPlanReason) : PlanUi
    data class Ready(
        val days: List<PlanDayUi>,
        val lowConfidence: Boolean,
        val lowConfidenceReasons: List<PlanLowConfidenceReason>,
        /** Sleep per night; Unavailable when no sleep need is known (no number is invented). */
        val sleepTarget: MetricState,
    ) : PlanUi
}

private val engine = WeeklyPlanEngine()

/** Plans [WeeklyPlanEngine.DAYS] days starting today. Pure. */
fun buildPlanUi(source: PlanSource?, today: Long): PlanUi {
    if (source == null) return PlanUi.Loading
    val result = engine.plan(
        WeeklyPlanInput(
            startEpochDay = today,
            personalStrainBase = source.personalStrainBase,
            todayRecovery = source.todayRecovery,
            loadZone = source.loadZone,
            loadCalibrating = source.loadCalibrating,
            sleepNeedMinutes = source.sleepNeedMinutes,
        ),
    )
    val plan = result.plan ?: return PlanUi.NoPlan(result.noPlanReason ?: NoPlanReason.STRAIN_BASE_MISSING)
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    val days = plan.days.map { d ->
        PlanDayUi(
            epochDay = d.epochDay,
            band = d.band,
            strainCentre = MetricState.Value(d.strainCentre, decimals = 1, unit = null, provenance = derived),
            reason = d.adjustment?.let { PlanReason.Adjusted(it) } ?: PlanReason.Pattern(d.band),
        )
    }
    val need = plan.days.firstOrNull()?.sleepTargetMinutes
    return PlanUi.Ready(
        days = days,
        lowConfidence = plan.confidence == PlanConfidence.LOW,
        lowConfidenceReasons = plan.lowConfidenceReasons.sorted(),
        sleepTarget = need?.let { MetricState.Value(it, decimals = 0, unit = null, provenance = derived) }
            ?: MetricState.Unavailable(MetricReason.NO_DATA),
    )
}

@StringRes
fun bandLabelRes(band: StrainBand): Int = when (band) {
    StrainBand.REST -> R.string.plan_band_rest
    StrainBand.LIGHT -> R.string.plan_band_light
    StrainBand.MODERATE -> R.string.plan_band_moderate
    StrainBand.HARD -> R.string.plan_band_hard
}

@StringRes
fun reasonRes(reason: PlanReason): Int = when (reason) {
    is PlanReason.Adjusted -> when (reason.adjustment) {
        PlanAdjustment.LOW_RECOVERY -> R.string.plan_reason_low_recovery
        PlanAdjustment.HIGH_LOAD_RATIO -> R.string.plan_reason_high_load
        PlanAdjustment.ELEVATED_LOAD_RATIO -> R.string.plan_reason_elevated_load
        PlanAdjustment.ATHLETE_UNAVAILABLE -> R.string.plan_reason_unavailable
        PlanAdjustment.HARD_DAY_LIMIT -> R.string.plan_reason_hard_limit
        PlanAdjustment.ENSURE_REST_DAY -> R.string.plan_reason_ensure_rest
    }
    is PlanReason.Pattern -> when (reason.band) {
        StrainBand.REST -> R.string.plan_reason_rest
        StrainBand.LIGHT -> R.string.plan_reason_light
        StrainBand.MODERATE -> R.string.plan_reason_moderate
        StrainBand.HARD -> R.string.plan_reason_hard
    }
}

@StringRes
fun lowConfidenceRes(reason: PlanLowConfidenceReason): Int = when (reason) {
    PlanLowConfidenceReason.LOAD_CALIBRATING -> R.string.plan_low_load_calibrating
    PlanLowConfidenceReason.LOAD_MISSING -> R.string.plan_low_load_missing
    PlanLowConfidenceReason.RECOVERY_MISSING -> R.string.plan_low_recovery_missing
    PlanLowConfidenceReason.SLEEP_NEED_MISSING -> R.string.plan_low_sleep_missing
}

@StringRes
fun noPlanRes(reason: NoPlanReason): Int = when (reason) {
    NoPlanReason.STRAIN_BASE_MISSING -> R.string.plan_no_plan_strain_base
}
