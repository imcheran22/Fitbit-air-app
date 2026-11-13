package com.apex.athlete.widget

import com.apex.athlete.core.data.repository.DailyDashboardState
import com.apex.athlete.core.data.repository.HeartRateTick
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.recoveryBandOf
import com.apex.athlete.ui.common.MetricStateMapper
import kotlin.math.roundToInt

/**
 * Turns the dashboard the app already computes into a [WidgetSnapshot]. The scores go through the same
 * [MetricStateMapper] as the Overview, so a widget can only say what the app says, with the same states.
 */
internal object WidgetSnapshotBuilder {

    fun build(
        dashboard: DailyDashboardState,
        mapper: MetricStateMapper,
        heartRate: HeartRateTick?,
        nowMillis: Long,
    ): WidgetSnapshot {
        val analysis = dashboard.analysis
        val bpm = heartRate?.bpm?.takeIf { it.isFinite() && it > 0.0 }?.roundToInt()
        val usable = bpm != null && heartRate != null
        return WidgetSnapshot(
            updatedAtMillis = nowMillis,
            epochDay = analysis.epochDay,
            isDemo = dashboard.isDemo,
            recovery = metric(mapper.recovery(analysis), withBand = true),
            sleep = metric(mapper.sleep(analysis)),
            strain = metric(mapper.strain(analysis)),
            heartRateBpm = if (usable) bpm else null,
            heartRateAtMillis = if (usable) heartRate?.epochMillis else null,
            heartRateProvenance = if (usable) heartRate?.provenance?.storageKey else null,
        )
    }

    /** A [MetricState] as stored. Loading, stale and error states carry no number, so they become "no data". */
    fun metric(state: MetricState, withBand: Boolean = false): WidgetMetric = when (state) {
        is MetricState.Value ->
            if (state.value.isFinite()) {
                WidgetMetric(
                    status = WidgetMetricStatus.VALUE,
                    value = state.value,
                    provenance = state.provenance?.storageKey,
                    provisional = state.isProvisional,
                    band = if (withBand) recoveryBandOf(state.value.roundToInt()).name else null,
                )
            } else {
                WidgetMetric.NO_DATA
            }
        is MetricState.Calibrating ->
            WidgetMetric(WidgetMetricStatus.CALIBRATING, calibrationDaysLeft = state.daysLeft?.takeIf { it > 0 })
        is MetricState.Unavailable -> WidgetMetric(WidgetMetricStatus.UNAVAILABLE, reason = state.reason.name)
        is MetricState.Stale, is MetricState.Error, MetricState.Loading ->
            WidgetMetric(WidgetMetricStatus.UNAVAILABLE, reason = MetricReason.NO_DATA.name)
    }
}
