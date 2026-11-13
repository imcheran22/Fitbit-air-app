package com.apex.athlete.widget

import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.DialMath
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.theme.RecoveryBand
import com.apex.athlete.core.ui.theme.recoveryBandOf
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/** Which of the three score rings a tile is. Decides the scale, the decimals and the colour. */
enum class RingKind(val decimals: Int) {
    RECOVERY(0),
    SLEEP(0),
    STRAIN(1),
}

/** What one ring tile shows. The vocabulary matches the app: a value, calibrating, or no data with its reason. */
sealed interface TileState {
    /** [fraction] is 0..1 of the ring; [band] is set for recovery only. */
    data class Value(
        val number: Double,
        val decimals: Int,
        val fraction: Float,
        val band: RecoveryBand?,
        val provenance: DataProvenance?,
        val provisional: Boolean,
    ) : TileState

    data class Calibrating(val daysLeft: Int?) : TileState

    data class Unavailable(val reason: MetricReason) : TileState
}

sealed interface HeartRateTile {
    /** A reading no older than [WidgetStateMapper.HEART_RATE_MAX_AGE_MILLIS]; [ageMinutes] is whole minutes, never negative. */
    data class Reading(val bpm: Int, val ageMinutes: Long, val provenance: DataProvenance?) : HeartRateTile

    /** Missing, too old, from the future or implausible: no number is shown. */
    data object NoRecent : HeartRateTile
}

sealed interface WidgetUiState {
    /** No snapshot, an unreadable one, or Demo mode: nothing about the owner is drawn. */
    data object OpenApex : WidgetUiState

    data class Content(
        val recovery: TileState,
        val sleep: TileState,
        val strain: TileState,
        val heartRate: HeartRateTile,
        val updatedAtMillis: Long,
    ) : WidgetUiState
}

/** How to word a heart-rate age. Kept separate from the text so the thresholds are testable without resources. */
enum class AgeUnit { JUST_NOW, MINUTES, HOURS }

data class AgeLabel(val unit: AgeUnit, val count: Int)

/** Pure mapping from the stored snapshot to what the widgets draw. No Android types, no I/O. */
object WidgetStateMapper {

    /** A heart rate older than this is "No recent reading", never a number. */
    const val HEART_RATE_MAX_AGE_MILLIS: Long = 6L * 60 * 60 * 1000

    /** A timestamp this far ahead of the clock is treated as clock skew; further ahead is not a reading. */
    private const val FUTURE_TOLERANCE_MILLIS: Long = 2L * 60 * 1000

    private const val MINUTE_MILLIS: Long = 60_000L

    fun map(snapshot: WidgetSnapshot?, nowMillis: Long, zone: ZoneId): WidgetUiState {
        if (snapshot == null || snapshot.isDemo) return WidgetUiState.OpenApex
        // Scores belong to one local day. After midnight, yesterday's numbers are not shown as today's.
        val today = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate().toEpochDay()
        val sameDay = today == snapshot.epochDay
        return WidgetUiState.Content(
            recovery = if (sameDay) tile(snapshot.recovery, RingKind.RECOVERY) else TileState.Unavailable(MetricReason.NO_DATA),
            sleep = if (sameDay) tile(snapshot.sleep, RingKind.SLEEP) else TileState.Unavailable(MetricReason.NO_DATA),
            strain = if (sameDay) tile(snapshot.strain, RingKind.STRAIN) else TileState.Unavailable(MetricReason.NO_DATA),
            heartRate = heartRate(snapshot, nowMillis),
            updatedAtMillis = snapshot.updatedAtMillis,
        )
    }

    fun tile(metric: WidgetMetric, kind: RingKind): TileState = when (metric.status) {
        WidgetMetricStatus.VALUE -> {
            val value = metric.value
            if (value == null || !value.isFinite()) {
                TileState.Unavailable(MetricReason.NO_DATA)
            } else {
                TileState.Value(
                    number = value,
                    decimals = kind.decimals,
                    fraction = when (kind) {
                        RingKind.STRAIN -> DialMath.strainFraction(value)
                        RingKind.RECOVERY, RingKind.SLEEP -> DialMath.fraction(value, DialMath.PERCENT_MAX)
                    },
                    band = if (kind == RingKind.RECOVERY) bandOf(metric, value) else null,
                    provenance = provenanceOf(metric.provenance),
                    provisional = metric.provisional,
                )
            }
        }
        WidgetMetricStatus.CALIBRATING -> TileState.Calibrating(metric.calibrationDaysLeft?.takeIf { it > 0 })
        WidgetMetricStatus.UNAVAILABLE -> TileState.Unavailable(reasonOf(metric.reason))
    }

    fun heartRate(snapshot: WidgetSnapshot, nowMillis: Long): HeartRateTile {
        val bpm = snapshot.heartRateBpm
        val at = snapshot.heartRateAtMillis
        if (bpm == null || at == null || bpm <= 0) return HeartRateTile.NoRecent
        val age = nowMillis - at
        if (age < -FUTURE_TOLERANCE_MILLIS || age > HEART_RATE_MAX_AGE_MILLIS) return HeartRateTile.NoRecent
        return HeartRateTile.Reading(bpm, (age.coerceAtLeast(0) / MINUTE_MILLIS), provenanceOf(snapshot.heartRateProvenance))
    }

    fun ageLabel(ageMinutes: Long): AgeLabel = when {
        ageMinutes < 1 -> AgeLabel(AgeUnit.JUST_NOW, 0)
        ageMinutes < 60 -> AgeLabel(AgeUnit.MINUTES, ageMinutes.toInt())
        else -> AgeLabel(AgeUnit.HOURS, (ageMinutes / 60).toInt())
    }

    private fun bandOf(metric: WidgetMetric, value: Double): RecoveryBand =
        RecoveryBand.entries.firstOrNull { it.name == metric.band } ?: recoveryBandOf(Math.round(value).toInt())

    private fun provenanceOf(key: String?): DataProvenance? = DataProvenance.entries.firstOrNull { it.storageKey == key }

    private fun reasonOf(name: String?): MetricReason = MetricReason.entries.firstOrNull { it.name == name } ?: MetricReason.NO_DATA
}
