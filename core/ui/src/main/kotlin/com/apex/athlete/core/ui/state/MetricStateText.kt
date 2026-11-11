package com.apex.athlete.core.ui.state

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.components.provenanceLabelRes

@StringRes
internal fun reasonShortRes(reason: MetricReason): Int = when (reason) {
    MetricReason.NO_DATA -> R.string.reason_no_data_short
    MetricReason.NOT_WORN -> R.string.reason_not_worn_short
    MetricReason.NO_HRV_LAST_NIGHT -> R.string.reason_no_hrv_short
    MetricReason.AWAITING_SLEEP_SYNC -> R.string.reason_awaiting_sleep_short
    MetricReason.INSUFFICIENT_HR_DATA -> R.string.reason_insufficient_hr_short
    MetricReason.NOT_CONNECTED -> R.string.reason_not_connected_short
    MetricReason.PERMISSION_MISSING -> R.string.reason_permission_short
}

@StringRes
internal fun reasonLongRes(reason: MetricReason): Int = when (reason) {
    MetricReason.NO_DATA -> R.string.reason_no_data_long
    MetricReason.NOT_WORN -> R.string.reason_not_worn_long
    MetricReason.NO_HRV_LAST_NIGHT -> R.string.reason_no_hrv_long
    MetricReason.AWAITING_SLEEP_SYNC -> R.string.reason_awaiting_sleep_long
    MetricReason.INSUFFICIENT_HR_DATA -> R.string.reason_insufficient_hr_long
    MetricReason.NOT_CONNECTED -> R.string.reason_not_connected_long
    MetricReason.PERMISSION_MISSING -> R.string.reason_permission_long
}

/** Localised plural lookup without the experimental `pluralStringResource`. */
@Composable
internal fun quantityString(id: Int, quantity: Int, vararg args: Any): String {
    val context = LocalContext.current
    return context.resources.getQuantityString(id, quantity, *args)
}

/**
 * The reason line for a state that has no number, or null for Loading / Value / Stale.
 * [short] gives the 2-3 word form used inside a dial or a tile.
 */
@Composable
fun metricReasonText(state: MetricState, short: Boolean = false): String? = when (state) {
    is MetricState.Calibrating -> when {
        state.daysLeft != null && !short ->
            quantityString(R.plurals.reason_calibrating_long, state.daysLeft, state.daysLeft)
        else -> stringResource(R.string.reason_calibrating_short)
    }
    is MetricState.Unavailable ->
        if (!short && state.detail != null) state.detail
        else stringResource(if (short) reasonShortRes(state.reason) else reasonLongRes(state.reason))
    is MetricState.Error ->
        if (!short && state.detail != null) state.detail else stringResource(R.string.reason_error_short)
    else -> null
}

/**
 * One sentence for TalkBack that carries what the visual carries: label, number, unit, provisional,
 * provenance, freshness or the reason it is missing (DESIGN_SYSTEM.md section 7).
 */
@Composable
fun metricSpoken(label: String, state: MetricState, extras: List<String> = emptyList()): String = when (state) {
    MetricState.Loading -> stringResource(R.string.cd_metric_loading, label)
    is MetricState.Value -> {
        val parts = buildList {
            add(stringResource(R.string.cd_metric_value, label, MetricFormat.withUnit(state.value, state.decimals, state.unit)))
            addAll(extras)
            if (state.isProvisional) add(stringResource(R.string.tag_provisional))
            add(
                state.provenance?.let { stringResource(provenanceLabelRes(it)) }
                    ?: stringResource(R.string.provenance_unknown),
            )
            state.asOf?.let { add(it) }
        }
        parts.joinToString(", ")
    }
    is MetricState.Stale -> {
        val value = stringResource(R.string.cd_metric_value, label, MetricFormat.withUnit(state.value, state.decimals, state.unit))
        val stale = stringResource(R.string.cd_metric_stale, state.since)
        val source = state.provenance?.let { stringResource(provenanceLabelRes(it)) } ?: stringResource(R.string.provenance_unknown)
        "$value, $stale, $source"
    }
    is MetricState.Calibrating, is MetricState.Unavailable, is MetricState.Error ->
        stringResource(R.string.cd_metric_unavailable, label, metricReasonText(state).orEmpty())
}
