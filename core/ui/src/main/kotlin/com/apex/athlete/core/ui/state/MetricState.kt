package com.apex.athlete.core.ui.state

import androidx.compose.runtime.Immutable
import com.apex.athlete.core.domain.DataProvenance
import java.util.Locale

/** Why a metric has no number. Copy lives in strings.xml (see [metricReasonText]). */
enum class MetricReason {
    NO_DATA,
    NOT_WORN,
    NO_HRV_LAST_NIGHT,
    AWAITING_SLEEP_SYNC,
    INSUFFICIENT_HR_DATA,
    NOT_CONNECTED,
    PERMISSION_MISSING,
}

/**
 * The UI state every metric renders through (DESIGN_SYSTEM.md sections 1 and 4, Pulse 4.9).
 *
 * A number is only ever displayed when it is inside [Value] or [Stale]. All other states show `--`
 * and a reason. Text such as [Value.asOf] and [Stale.since] is already formatted by the caller
 * (relative time and locale belong to the ViewModel mapper, not to the component).
 */
@Immutable
sealed interface MetricState {

    /** Waiting for the repository flow. Components render a skeleton in their final shape. */
    data object Loading : MetricState

    /** A real number with its source. [isProvisional] shows the Provisional tag. */
    data class Value(
        val value: Double,
        val decimals: Int = 0,
        val unit: String? = null,
        val provenance: DataProvenance?,
        val asOf: String? = null,
        val isProvisional: Boolean = false,
    ) : MetricState {
        fun numberText(locale: Locale = Locale.getDefault()): String = MetricFormat.number(value, decimals, locale)
    }

    /** The baseline is still filling in; [daysLeft] is the nights still needed when known. */
    data class Calibrating(val daysLeft: Int? = null) : MetricState

    /** An older value that is no longer current. [since] is the formatted age or date of the reading. */
    data class Stale(
        val value: Double,
        val decimals: Int = 0,
        val unit: String? = null,
        val provenance: DataProvenance?,
        val since: String,
    ) : MetricState {
        fun numberText(locale: Locale = Locale.getDefault()): String = MetricFormat.number(value, decimals, locale)
    }

    /** No value exists, with the reason. [detail] overrides the stock long copy when given. */
    data class Unavailable(val reason: MetricReason = MetricReason.NO_DATA, val detail: String? = null) : MetricState

    /** The read or calculation failed. [detail] is a short human message, never a stack trace. */
    data class Error(val detail: String? = null) : MetricState
}

/** The numeric payload when the state carries one, otherwise null. */
fun MetricState.numberOrNull(): Double? = when (this) {
    is MetricState.Value -> value.takeIf { it.isFinite() }
    is MetricState.Stale -> value.takeIf { it.isFinite() }
    else -> null
}

fun MetricState.unitOrNull(): String? = when (this) {
    is MetricState.Value -> unit
    is MetricState.Stale -> unit
    else -> null
}

fun MetricState.decimalsOrZero(): Int = when (this) {
    is MetricState.Value -> decimals
    is MetricState.Stale -> decimals
    else -> 0
}

/** True when this state is one of the "no number, show a reason" states. */
fun MetricState.isReason(): Boolean =
    this is MetricState.Calibrating || this is MetricState.Unavailable || this is MetricState.Error
