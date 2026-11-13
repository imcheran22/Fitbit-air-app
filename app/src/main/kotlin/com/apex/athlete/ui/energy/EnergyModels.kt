package com.apex.athlete.ui.energy

import androidx.annotation.StringRes
import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.StressEnergyState
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.overview.energyCurvePoints
import com.apex.athlete.ui.overview.energyMissingState

/*
 * Energy bank detail. The bank is a model that starts at the morning recovery score (not a measurement), so every number
 * carries the calculated provenance and the screen says "estimate". Missing is a MetricState with its reason, never 0.
 */

/** The terms of the model, in display order: three drains then two charges. */
enum class EnergyTerm(@StringRes val labelRes: Int, val isDrain: Boolean) {
    BASAL(R.string.energy_term_basal, true),
    ACTIVITY(R.string.energy_term_activity, true),
    STRESS(R.string.energy_term_stress, true),
    REST(R.string.energy_term_rest, false),
    NAP(R.string.energy_term_nap, false),
}

@Immutable
data class EnergyTermUi(val term: EnergyTerm, val state: MetricState)

@Immutable
data class EnergyDetailUi(
    val epochDay: Long,
    val bank: MetricState,
    val lowest: MetricState,
    val start: MetricState,
    val terms: List<EnergyTermUi>,
    /** Awake minutes without a stress level (they only drained at the basal rate); null without a curve. */
    val unscoredStressMinutes: Int?,
    val points: List<ChartPoint>,
    val windowStartMillis: Long,
    val windowEndMillis: Long,
    val isProvisional: Boolean,
) {
    val drains: List<EnergyTermUi> get() = terms.filter { it.term.isDrain }
    val charges: List<EnergyTermUi> get() = terms.filter { !it.term.isDrain }

    companion object {
        val Loading = EnergyDetailUi(
            0L, MetricState.Loading, MetricState.Loading, MetricState.Loading,
            EnergyTerm.entries.map { EnergyTermUi(it, MetricState.Loading) }, null, emptyList(), 0L, 0L, false,
        )
    }
}

fun buildEnergyDetail(s: StressEnergyState, f: ApexFormatter): EnergyDetailUi {
    val energy = s.energy
    if (energy == null) {
        val missing = energyMissingState(s.energyMissing, f)
        return EnergyDetailUi(
            s.epochDay, missing, missing, missing, EnergyTerm.entries.map { EnergyTermUi(it, missing) },
            null, emptyList(), 0L, 0L, s.isProvisional,
        )
    }
    val derived = s.provenance
    fun bank(v: Double, unit: String) =
        if (v.isFinite()) MetricState.Value(v, 0, unit, derived, isProvisional = s.isProvisional) else MetricState.Unavailable(MetricReason.NO_DATA)
    fun points(v: Double) =
        if (v.isFinite()) MetricState.Value(v, 1, f.string(R.string.detail_unit_points), derived, isProvisional = s.isProvisional)
        else MetricState.Unavailable(MetricReason.NO_DATA)
    val unit = f.string(R.string.energy_unit)
    val curve = energyCurvePoints(energy.curve)
    return EnergyDetailUi(
        epochDay = s.epochDay,
        bank = bank(energy.currentLevel, unit),
        lowest = bank(energy.lowestLevel, unit),
        start = bank(energy.startLevel, unit),
        terms = listOf(
            EnergyTermUi(EnergyTerm.BASAL, points(energy.drainedBasal)),
            EnergyTermUi(EnergyTerm.ACTIVITY, points(energy.drainedActivity)),
            EnergyTermUi(EnergyTerm.STRESS, points(energy.drainedStress)),
            EnergyTermUi(EnergyTerm.REST, points(energy.chargedRest)),
            EnergyTermUi(EnergyTerm.NAP, points(energy.chargedNap)),
        ),
        unscoredStressMinutes = energy.unscoredStressMinutes.takeIf { it > 0 },
        points = curve,
        windowStartMillis = curve.firstOrNull()?.x ?: 0L,
        windowEndMillis = curve.lastOrNull()?.x ?: 0L,
        isProvisional = s.isProvisional,
    )
}
