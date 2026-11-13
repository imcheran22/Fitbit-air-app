package com.apex.athlete.ui.nap

import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.data.repository.NapDetailState
import com.apex.athlete.core.data.repository.NapsState
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.charts.HypnogramSegment
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.sleep.segmentsOf
import java.time.LocalDate

/*
 * Naps. Pure mapping, no Compose. Start and end are shown in the offset the session was recorded in; every minute count keeps
 * the source's provenance, and a count the source did not report is Unavailable, never 0.
 */

private const val MINUTE_MS = 60_000L

/** Whole minutes between start and end of [s]. */
fun napMinutes(s: SleepSessionEntity): Double = ((s.endEpochMillis - s.startEpochMillis) / MINUTE_MS).toDouble()

/** "13:10 to 13:55" in the recorded offsets and the owner's 12 or 24 hour style. */
fun napTimeRange(s: SleepSessionEntity, f: ApexFormatter): String =
    f.string(
        R.string.nap_time_range,
        f.clockTime(s.startEpochMillis, s.startZoneOffsetSeconds),
        f.clockTime(s.endEpochMillis, s.endZoneOffsetSeconds),
    )

private fun minutesState(value: Int?, provenance: DataProvenance, f: ApexFormatter): MetricState =
    if (value == null || value < 0) {
        MetricState.Unavailable(MetricReason.NO_DATA)
    } else {
        MetricState.Value(value.toDouble(), 0, f.string(R.string.nap_unit_min), provenance)
    }

@Immutable
data class NapRowUi(
    val id: String,
    val timeRange: String,
    /** Start to end of the session. */
    val duration: MetricState,
    val provenance: DataProvenance,
)

fun buildNapRows(s: NapsState, f: ApexFormatter): List<NapRowUi> =
    s.naps.map { nap ->
        NapRowUi(
            id = nap.id,
            timeRange = napTimeRange(nap, f),
            duration = MetricState.Value(napMinutes(nap), 0, f.string(R.string.nap_unit_min), nap.provenance),
            provenance = nap.provenance,
        )
    }

@Immutable
data class NapStageRowUi(val stage: SleepStage, val state: MetricState)

@Immutable
data class NapDetailUi(
    val dayLabel: String,
    val timeRange: String,
    val inBed: MetricState,
    val asleep: MetricState,
    val awake: MetricState,
    val toFallAsleep: MetricState,
    /** Deep, REM and light minutes; empty when the session has no stage scoring. */
    val stageRows: List<NapStageRowUi>,
    val hasStages: Boolean,
    val segments: List<HypnogramSegment>,
    val zoneOffsetSeconds: Int,
    val provenance: DataProvenance,
)

fun buildNapDetail(d: NapDetailState, f: ApexFormatter): NapDetailUi {
    val n = d.nap
    val p = n.provenance
    val staged = n.hasStages
    return NapDetailUi(
        dayLabel = f.dayLabel(LocalDate.ofEpochDay(n.epochDay)),
        timeRange = napTimeRange(n, f),
        inBed = MetricState.Value(napMinutes(n), 0, f.string(R.string.nap_unit_min), p),
        asleep = minutesState(n.minutesAsleep, p, f),
        awake = minutesState(n.minutesAwake, p, f),
        toFallAsleep = minutesState(n.minutesToFallAsleep, p, f),
        stageRows = if (staged) {
            listOf(
                NapStageRowUi(SleepStage.DEEP, minutesState(n.minutesDeep, p, f)),
                NapStageRowUi(SleepStage.REM, minutesState(n.minutesRem, p, f)),
                NapStageRowUi(SleepStage.LIGHT, minutesState(n.minutesLight, p, f)),
            )
        } else {
            emptyList()
        },
        hasStages = staged && d.stages.isNotEmpty(),
        segments = segmentsOf(d.stages),
        zoneOffsetSeconds = n.startZoneOffsetSeconds,
        provenance = p,
    )
}
