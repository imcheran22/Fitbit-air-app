package com.apex.athlete.ui.overview

import androidx.compose.runtime.Immutable
import com.apex.athlete.R
import com.apex.athlete.core.analytics.baseline.BaselineStatus
import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.analytics.trend.RangeStatus
import com.apex.athlete.core.data.repository.DailyDashboardState
import com.apex.athlete.core.data.repository.MonitorItem
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartClock
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.shell.SyncStatus
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.research.PatternUi
import com.apex.athlete.ui.research.patternsOf
import com.apex.athlete.ui.common.MetricStateMapper
import java.time.LocalDate

/** Why the strain target card has no range. */
enum class StrainTargetNote { None, Calibrating, Unavailable }

@Immutable
data class MonitorRowUi(
    val metric: MetricType,
    val state: MetricState,
    val average: Double?,
    val range: RangeStatus,
)

@Immutable
data class AlertUi(val metric: MetricType, val above: Boolean, val provenance: DataProvenance?)

/** Everything the Overview draws, already mapped to [MetricState] and plain text. */
@Immutable
data class OverviewUi(
    val phase: OverviewPhase,
    val dateLabel: String,
    val canGoNext: Boolean,
    val syncText: String,
    val syncStatus: SyncStatus,
    val syncDescription: String,
    /** Set when the newest reading is older than 36 h on the current day. */
    val staleSince: String?,
    val sleep: MetricState,
    val recovery: MetricState,
    val strain: MetricState,
    val strainTargetLow: Double?,
    val strainTargetHigh: Double?,
    val strainTargetNote: StrainTargetNote,
    /** Rule-based sentence from the coach engine about strain, or null. */
    val strainPrescription: String?,
    val heartRate: MetricState,
    val heartRatePoints: List<ChartPoint>,
    val heartRateWindowStart: Long,
    val heartRateWindowEnd: Long,
    val clock: ChartClock,
    val monitor: List<MonitorRowUi>,
    val monitorOutside: Int,
    val monitorEvaluated: Int,
    val alerts: List<AlertUi>,
    val coachHeadline: String?,
    /** Detected multi-signal patterns with hedged wording; empty when none was detected. */
    val patterns: List<PatternUi> = emptyList(),
)

private val MONITOR_PLACEHOLDERS = listOf(
    MetricType.HRV_RMSSD,
    MetricType.RESTING_HEART_RATE,
    MetricType.SPO2_AVG,
    MetricType.RESPIRATORY_RATE,
    MetricType.SKIN_TEMP_DEVIATION,
)

/** Maps the repository result for [day] to what the screen draws. A result for another day counts as loading. */
fun buildOverviewUi(dashboard: DailyDashboardState?, day: LocalDate, formatter: ApexFormatter): OverviewUi {
    val mapper = MetricStateMapper(formatter)
    val loaded = dashboard != null && dashboard.analysis.epochDay == day.toEpochDay()
    val d = if (loaded) dashboard else null
    val phase = overviewPhase(loaded, d?.hasAnyData ?: false)
    val now = formatter.now()
    val today = formatter.today()

    val lastSync = d?.lastSyncMillis
    val syncText = when {
        d == null -> formatter.string(R.string.overview_sync_unknown)
        d.isDemo -> formatter.string(R.string.overview_sync_demo)
        lastSync == null -> formatter.string(R.string.overview_sync_never)
        else -> formatter.relativeTime(lastSync)
    }
    val syncDescription = formatter.string(
        R.string.overview_sync_description,
        when {
            d == null -> formatter.string(R.string.overview_sync_unknown_description)
            d.isDemo -> formatter.string(R.string.overview_sync_demo_description)
            else -> formatter.syncedAgo(lastSync)
        },
    )

    val staleSince = d?.takeIf { !it.isDemo && it.hasAnyData && day == today }
        ?.newestDataMillis?.takeIf { formatter.isStale(it) }
        ?.let { formatter.relativeTime(it) }

    val base = OverviewUi(
        phase = phase,
        dateLabel = formatter.dayLabel(day),
        canGoNext = day.isBefore(today),
        syncText = syncText,
        syncStatus = syncStatusFor(loaded, d?.isDemo ?: false, lastSync, now),
        syncDescription = syncDescription,
        staleSince = staleSince,
        sleep = MetricState.Loading,
        recovery = MetricState.Loading,
        strain = MetricState.Loading,
        strainTargetLow = null,
        strainTargetHigh = null,
        strainTargetNote = StrainTargetNote.None,
        strainPrescription = null,
        heartRate = MetricState.Loading,
        heartRatePoints = emptyList(),
        heartRateWindowStart = 0L,
        heartRateWindowEnd = 0L,
        clock = ChartClock(use24Hour = formatter.clock24h),
        monitor = MONITOR_PLACEHOLDERS.map { MonitorRowUi(it, MetricState.Loading, null, RangeStatus.NO_READING) },
        monitorOutside = 0,
        monitorEvaluated = 0,
        alerts = emptyList(),
        coachHeadline = null,
    )

    if (d == null) return base
    if (phase == OverviewPhase.Empty) {
        val none = MetricState.Unavailable(MetricReason.NOT_CONNECTED)
        return base.copy(sleep = none, recovery = none, strain = none, heartRate = none, monitor = emptyList())
    }

    val a = d.analysis
    val tick = d.latestHeartRate
    val hrState = if (tick?.bpm == null) {
        MetricState.Unavailable(MetricReason.NO_DATA)
    } else {
        mapper.value(tick.bpm, 0, "bpm", tick.provenance, tick.epochMillis)
    }
    val points = d.recentHeartRate.map { ChartPoint(it.epochMillis, it.bpm) }
    val target = a.strainTarget
    val rows = d.monitor.map { monitorRow(mapper, formatter, it) }
    val (outside, evaluated) = rangeCounts(rows.map { it.range })
    val alerts = d.monitor.mapNotNull { item ->
        val above = item.intelligence.rangeStatus == RangeStatus.ABOVE_NORMAL
        val below = item.intelligence.rangeStatus == RangeStatus.BELOW_NORMAL
        if ((above || below) && item.intelligence.current != null) AlertUi(item.metric, above, item.provenance) else null
    }
    val note = when {
        target != null -> StrainTargetNote.None
        a.recovery.status == RecoveryStatus.CALIBRATING -> StrainTargetNote.Calibrating
        else -> StrainTargetNote.Unavailable
    }
    return base.copy(
        sleep = mapper.sleep(a),
        recovery = mapper.recovery(a),
        strain = mapper.strain(a),
        strainTargetLow = target?.low,
        strainTargetHigh = target?.high,
        strainTargetNote = note,
        strainPrescription = d.briefing.lines.firstOrNull { it.topic == com.apex.athlete.core.data.coach.CoachLine.Topic.STRAIN }?.text,
        heartRate = hrState,
        heartRatePoints = points,
        heartRateWindowStart = points.firstOrNull()?.x ?: 0L,
        heartRateWindowEnd = points.lastOrNull()?.x ?: 0L,
        monitor = rows,
        monitorOutside = outside,
        monitorEvaluated = evaluated,
        alerts = alerts,
        coachHeadline = d.briefing.headline,
        patterns = patternsOf(a.research),
    )
}

private fun monitorRow(mapper: MetricStateMapper, formatter: ApexFormatter, item: MonitorItem): MonitorRowUi {
    val i = item.intelligence
    val state = if (i.current == null && i.baseline.status == BaselineStatus.CALIBRATING) {
        MetricState.Calibrating(mapper.calibrationDaysLeft(i))
    } else {
        mapper.intelligence(i, item.metric, item.provenance)
    }
    val average = i.baseline.center?.takeIf { it.isFinite() }?.let {
        if (item.metric == MetricType.SKIN_TEMP_DEVIATION) formatter.temperatureDeltaValue(it) else it
    }
    return MonitorRowUi(item.metric, state, average, i.rangeStatus)
}
