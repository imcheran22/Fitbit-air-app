package com.apex.athlete.widget

import android.content.Context
import android.text.format.DateUtils
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.provenanceLabelRes
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.theme.RecoveryBand

/** All widget wording, from resources. Spoken sentences carry what the picture carries: label, number, source, state. */
internal class WidgetStrings(private val context: Context) {

    fun label(kind: RingKind): String = context.getString(
        when (kind) {
            RingKind.RECOVERY -> R.string.widget_label_recovery
            RingKind.SLEEP -> R.string.widget_label_sleep
            RingKind.STRAIN -> R.string.widget_label_strain
        },
    )

    /** `number` as drawn in the ring (`74`, `12.3`), or `--` without a value. */
    fun centre(tile: TileState): String = when (tile) {
        is TileState.Value -> MetricFormat.number(tile.number, tile.decimals)
        else -> MetricFormat.MISSING
    }

    /** "● Measured" for an observed source, "○ Calculated" for a derived or estimated one. */
    fun provenanceMark(provenance: DataProvenance?): String {
        val name = provenance?.let { context.getString(provenanceLabelRes(it)) } ?: context.getString(R.string.widget_source_unknown)
        return context.getString(
            if (provenance?.isObserved == true) R.string.widget_provenance_mark_observed else R.string.widget_provenance_mark_derived,
            name,
        )
    }

    /** The reason line for a tile without a number. */
    fun reason(tile: TileState): String = when (tile) {
        is TileState.Calibrating -> context.getString(R.string.widget_calibrating)
        is TileState.Unavailable -> reasonText(tile.reason)
        is TileState.Value -> ""
    }

    fun provisional(): String = context.getString(R.string.widget_provisional)

    /** The line under the ring: the source for a value, the reason otherwise. */
    fun subLine(tile: TileState): String = when (tile) {
        is TileState.Value -> provenanceMark(tile.provenance)
        else -> reason(tile)
    }

    fun spoken(kind: RingKind, tile: TileState): String {
        val label = label(kind)
        return when (tile) {
            is TileState.Value -> {
                val head = when (kind) {
                    RingKind.RECOVERY -> context.getString(
                        R.string.widget_cd_recovery_value,
                        Math.round(tile.number).toInt(),
                        bandWord(tile.band),
                    )
                    RingKind.SLEEP -> context.getString(R.string.widget_cd_sleep_value, Math.round(tile.number).toInt())
                    RingKind.STRAIN -> context.getString(R.string.widget_cd_strain_value, centre(tile))
                }
                val parts = buildList {
                    add(head)
                    if (tile.provisional) add(provisional())
                    add(provenanceName(tile.provenance))
                }
                parts.joinToString(", ")
            }
            is TileState.Calibrating ->
                if (tile.daysLeft != null) {
                    context.getString(R.string.widget_cd_calibrating_nights, label, nightsLeft(tile.daysLeft))
                } else {
                    context.getString(R.string.widget_cd_calibrating, label)
                }
            is TileState.Unavailable -> context.getString(R.string.widget_cd_unavailable, label, reasonText(tile.reason))
        }
    }

    fun heartRateSpoken(tile: HeartRateTile): String = when (tile) {
        is HeartRateTile.Reading -> {
            val head = context.getString(R.string.widget_cd_hr_value, tile.bpm, age(tile.ageMinutes))
            "$head, ${provenanceName(tile.provenance)}"
        }
        HeartRateTile.NoRecent -> context.getString(R.string.widget_cd_hr_none)
    }

    fun age(ageMinutes: Long): String {
        val label = WidgetStateMapper.ageLabel(ageMinutes)
        return when (label.unit) {
            AgeUnit.JUST_NOW -> context.getString(R.string.widget_age_just_now)
            AgeUnit.MINUTES -> context.getString(R.string.widget_age_minutes, label.count)
            AgeUnit.HOURS -> context.getString(R.string.widget_age_hours, label.count)
        }
    }

    /** "Updated 14:32" in the phone's clock style; a date is added when the update was not today. */
    fun updated(updatedAtMillis: Long): String {
        val flags = DateUtils.FORMAT_SHOW_TIME or
            (if (DateUtils.isToday(updatedAtMillis)) 0 else DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_ABBREV_ALL)
        return context.getString(R.string.widget_updated, DateUtils.formatDateTime(context, updatedAtMillis, flags))
    }

    fun join(first: String, second: String): String = context.getString(R.string.widget_cd_join, first, second)

    private fun nightsLeft(days: Int): String = context.resources.getQuantityString(R.plurals.widget_calibrating_nights, days, days)

    private fun provenanceName(provenance: DataProvenance?): String =
        provenance?.let { context.getString(provenanceLabelRes(it)) } ?: context.getString(R.string.widget_source_unknown)

    private fun bandWord(band: RecoveryBand?): String = context.getString(
        when (band) {
            RecoveryBand.GREEN -> R.string.widget_band_green
            RecoveryBand.YELLOW -> R.string.widget_band_yellow
            RecoveryBand.RED, null -> R.string.widget_band_red
        },
    )

    private fun reasonText(reason: MetricReason): String = context.getString(
        when (reason) {
            MetricReason.NO_DATA -> R.string.widget_reason_no_data
            MetricReason.NOT_WORN -> R.string.widget_reason_not_worn
            MetricReason.NO_HRV_LAST_NIGHT -> R.string.widget_reason_no_hrv
            MetricReason.AWAITING_SLEEP_SYNC -> R.string.widget_reason_awaiting_sleep
            MetricReason.INSUFFICIENT_HR_DATA -> R.string.widget_reason_insufficient_hr
            MetricReason.NOT_CONNECTED -> R.string.widget_reason_not_connected
            MetricReason.PERMISSION_MISSING -> R.string.widget_reason_permission
        },
    )
}
