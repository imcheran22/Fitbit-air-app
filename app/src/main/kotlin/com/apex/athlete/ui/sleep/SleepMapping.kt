package com.apex.athlete.ui.sleep

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.analytics.sleep.BaseNeedSource
import com.apex.athlete.core.analytics.sleep.DipCategory
import com.apex.athlete.core.analytics.sleep.DipMissing
import com.apex.athlete.core.analytics.sleep.HeartRateDipResult
import com.apex.athlete.core.analytics.sleep.SleepRegularity
import com.apex.athlete.core.analytics.sleep.SleepRegularityIndex
import com.apex.athlete.core.analytics.sleep.SleepBand
import com.apex.athlete.core.analytics.sleep.SleepBands
import com.apex.athlete.core.analytics.sleep.SleepComponent
import com.apex.athlete.core.analytics.sleep.SleepLatency
import com.apex.athlete.core.analytics.sleep.SleepLatencyNote
import com.apex.athlete.core.analytics.sleep.SleepScoreConfidence
import com.apex.athlete.core.analytics.trend.MetricIntelligence
import com.apex.athlete.core.analytics.sleep.SleepScoreResult
import com.apex.athlete.core.data.repository.SleepDetailState
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.charts.HypnogramSegment
import com.apex.athlete.core.ui.components.ContributorStatus
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.ui.common.MetricStateMapper

fun SleepBand?.toStatus(): ContributorStatus? = when (this) {
    null -> null
    SleepBand.POOR -> ContributorStatus.Poor
    SleepBand.SUFFICIENT -> ContributorStatus.Sufficient
    SleepBand.OPTIMAL -> ContributorStatus.Optimal
}

/** One row of the summary card. [status] is null when the figure is missing. */

/** Which overnight signal moved the restoration part, and which way against its own usual. */
enum class RestorationSignal { SLEEPING_HEART_RATE, HRV, BREATHING_RATE }

enum class VsUsual { LOWER, SIMILAR, HIGHER }

data class RestorationDriverUi(val signal: RestorationSignal, val vsUsual: VsUsual)

/**
 * One of the five score parts. [state] is the 0..100 sub-score, or `--` with the reason when the part could not be
 * computed (never a placeholder number). [weightPercent] is the weight the part actually carried in this score.
 */
data class SleepPartUi(
    val component: SleepComponent,
    val state: MetricState,
    val status: ContributorStatus?,
    val weightPercent: Int?,
    val points: Double?,
    /** Set while the part is missing: why, so the row and the partial-score hint can say so. */
    @StringRes val missingReasonRes: Int?,
    /** Restoration only: what drove it. Empty when none of the three signals has a baseline yet. */
    val drivers: List<RestorationDriverUi> = emptyList(),
)

/** Shown when the score is not HIGH confidence: how many of the five parts it rests on and which are missing. */
data class PartialScoreUi(val availableParts: Int, val missing: List<SleepComponent>)

data class StageRowUi(val stage: SleepStage, val percentOfAsleep: Double?, val minutes: Int?)

data class NeedUi(
    val baseMinutes: Double,
    val strainMinutes: Double,
    val debtMinutes: Double,
    val totalMinutes: Double,
    val usesDefaultBase: Boolean,
    /** False while the debt surcharge is unknown (fewer than 4 recorded nights): shown as calibrating, not as 0 h. */
    val debtKnown: Boolean = true,
)

data class SleepInsightUi(
    val sufficient: Boolean,
    val deficitMinutes: Double,
    /** Set only when consistency is below optimal and the spread is known. */
    val bedtimeSpreadMinutes: Double?,
)

data class SleepUi(
    val score: MetricState,
    val scoreStatus: ContributorStatus?,
    /** The five parts in nominal-weight order; empty while there is no score. */
    val parts: List<SleepPartUi>,
    val partial: PartialScoreUi?,
    /** What the duration part was scored against (need, never below the 7 h guideline). */
    val asleepMinutes: Double?,
    val targetMinutes: Double?,
    val bedtimeSpreadMinutes: Double?,
    val hasSession: Boolean,
    val hasStageDetail: Boolean,
    val segments: List<HypnogramSegment>,
    /** UTC offset the session started at, so clock labels follow the place the night was slept in. */
    val zoneOffsetSeconds: Int?,
    val stageRows: List<StageRowUi>,
    val timeInBed: MetricState,
    val latency: MetricState,
    /** True when the provider reported 0 minutes to fall asleep: shown with a "not measured" caption. */
    val latencyNotMeasured: Boolean,
    val wakeBouts: MetricState,
    val need: NeedUi,
    val needTonightMinutes: Double,
    val suggestedBedtimeMinute: Int?,
    val usualWakeMinute: Int?,
    val insight: SleepInsightUi?,
    val sessionProvenance: DataProvenance?,
    /** Sleep Regularity Index of the last week (-100..100); Calibrating below two usable day pairs. */
    val regularity: MetricState,
    /** Sleeping heart rate against the daytime mean. */
    val hrDip: HrDipUi,
    /** Net shortfall over the last 7 nights in hours; Calibrating below 4 recorded nights. */
    val debt: MetricState,
    // TODO: show the secondary "Shortfall vs 7 h guideline" line once DayAnalysis exposes GuidelineSleepShortfall
    //  (SleepRegularity.guidelineShortfall); it is not in the UI state yet. Personal debt above stays primary.
)

/**
 * The sleeping heart-rate dip: [state] is the percent (positive = sleeping heart rate below the daytime mean) with the
 * [category] label, or Unavailable. [missingReasonRes] is the string explaining why there is no value; the screen turns it
 * into the state's reason text.
 */
data class HrDipUi(val state: MetricState, val category: DipCategory?, @StringRes val missingReasonRes: Int?)

private const val MINUTES_PER_DAY_PAIR = SleepRegularityIndex.MINUTES_PER_DAY

/**
 * The Sleep Regularity Index as a metric. Below [SleepRegularityIndex.MIN_PAIRS] usable day pairs the engine has no index:
 * that is Calibrating with the pairs still needed, never 0 and never Unavailable.
 */
fun sleepRegularityState(r: SleepRegularity): MetricState {
    val index = r.index
    if (index != null && index.isFinite()) return MetricState.Value(index, 0, null, DataProvenance.MATHEMATICALLY_DERIVED)
    val pairs = r.minutePairs / MINUTES_PER_DAY_PAIR
    return MetricState.Calibrating((SleepRegularityIndex.MIN_PAIRS - pairs).coerceAtLeast(1))
}

@StringRes
fun dipMissingRes(missing: DipMissing?): Int = when (missing) {
    DipMissing.NO_DAYTIME_HEART_RATE -> R.string.sleep_dip_missing_daytime
    DipMissing.NO_SLEEPING_HEART_RATE -> R.string.sleep_dip_missing_sleeping
    DipMissing.TOO_FEW_MINUTES -> R.string.sleep_dip_missing_few
    DipMissing.INVALID_INPUT, null -> R.string.sleep_dip_missing_generic
}

fun hrDipOf(result: HeartRateDipResult): HrDipUi {
    val fraction = result.dipFraction
    if (fraction == null || !fraction.isFinite()) {
        return HrDipUi(MetricState.Unavailable(MetricReason.NO_DATA), null, dipMissingRes(result.missing))
    }
    return HrDipUi(
        state = MetricState.Value(fraction * 100.0, 1, "%", DataProvenance.MATHEMATICALLY_DERIVED),
        category = result.category,
        missingReasonRes = null,
    )
}

/** Accumulated sleep debt in hours; null (fewer than 4 recorded nights) is Calibrating, never 0 h. */
fun sleepDebtState(accumulatedMinutes: Double?): MetricState =
    if (accumulatedMinutes != null && accumulatedMinutes.isFinite()) {
        MetricState.Value(accumulatedMinutes / 60.0, 1, "h", DataProvenance.MATHEMATICALLY_DERIVED)
    } else {
        MetricState.Calibrating(null)
    }

fun segmentsOf(stages: List<SleepStageSegmentEntity>): List<HypnogramSegment> =
    stages.map { HypnogramSegment(it.startEpochMillis, it.endEpochMillis, it.stage) }

private const val SIMILAR_Z = 0.5

fun vsUsualOf(z: Double): VsUsual = when {
    z >= SIMILAR_Z -> VsUsual.HIGHER
    z <= -SIMILAR_Z -> VsUsual.LOWER
    else -> VsUsual.SIMILAR
}

/** The signals behind the restoration part, from the same z-scores the engine was given. Missing ones are left out. */
fun restorationDrivers(
    sleepingHeartRate: MetricIntelligence,
    hrv: MetricIntelligence,
    respiratoryRate: MetricIntelligence,
): List<RestorationDriverUi> = listOfNotNull(
    sleepingHeartRate.zScore?.takeIf { it.isFinite() }?.let { RestorationDriverUi(RestorationSignal.SLEEPING_HEART_RATE, vsUsualOf(it)) },
    hrv.zScore?.takeIf { it.isFinite() }?.let { RestorationDriverUi(RestorationSignal.HRV, vsUsualOf(it)) },
    respiratoryRate.zScore?.takeIf { it.isFinite() }?.let { RestorationDriverUi(RestorationSignal.BREATHING_RATE, vsUsualOf(it)) },
)

@StringRes
fun missingPartReasonRes(component: SleepComponent): Int = when (component) {
    SleepComponent.RESTORATION -> R.string.sleep_part_missing_restoration
    SleepComponent.QUALITY -> R.string.sleep_part_missing_quality
    SleepComponent.CONSISTENCY -> R.string.sleep_part_missing_consistency
    SleepComponent.DURATION -> R.string.sleep_part_missing_duration
    SleepComponent.EFFICIENCY -> R.string.sleep_part_missing_efficiency
}

/** The five parts with sub-score, weight, band and (when missing) the reason. A missing part never gets a number. */
fun sleepParts(sleep: SleepScoreResult, drivers: List<RestorationDriverUi>): List<SleepPartUi> =
    SleepComponent.entries.map { component ->
        val c = sleep.contributions.firstOrNull { it.component == component }
        val sub = c?.subScore?.takeIf { c.available && it.isFinite() }
        if (c == null || sub == null) {
            SleepPartUi(
                component, MetricState.Unavailable(MetricReason.NO_DATA), null, null, null, missingPartReasonRes(component),
            )
        } else {
            val band = when (component) {
                SleepComponent.DURATION -> SleepBands.duration(sleep.asleepMinutes, sleep.durationTargetMinutes)
                SleepComponent.RESTORATION -> SleepBands.restoration(sleep.restorationZ)
                SleepComponent.QUALITY -> SleepBands.quality(sub)
                SleepComponent.EFFICIENCY -> SleepBands.efficiency(sleep.efficiencyPercent)
                SleepComponent.CONSISTENCY -> SleepBands.consistency(sub)
            }
            SleepPartUi(
                component = component,
                state = MetricState.Value(sub, 0, null, DataProvenance.MATHEMATICALLY_DERIVED),
                status = band.toStatus(),
                weightPercent = Math.round(c.effectiveWeight * 100.0).toInt(),
                points = c.points,
                missingReasonRes = null,
                drivers = if (component == SleepComponent.RESTORATION) drivers else emptyList(),
            )
        }
    }

fun partialScoreOf(sleep: SleepScoreResult): PartialScoreUi? {
    if (sleep.confidence == SleepScoreConfidence.HIGH) return null
    val missing = sleep.contributions.filter { !it.available || it.subScore == null }.map { it.component }
    return PartialScoreUi(SleepComponent.entries.size - missing.size, missing)
}

fun buildSleepUi(detail: SleepDetailState, mapper: MetricStateMapper): SleepUi {
    val a = detail.analysis
    val sleep = a.sleep
    val session: SleepSessionEntity? = a.sleepSession
    val measured = session?.provenance

    // One reason for every figure that needs the night: awaiting sync today, no data otherwise.
    val gone: MetricState = mapper.sleep(a).takeIf { sleep == null } ?: MetricState.Unavailable(MetricReason.NO_DATA)

    val parts = sleep?.let { sleepParts(it, restorationDrivers(a.sleepingHeartRate, a.hrv, a.respiratoryRate)) } ?: emptyList()

    val stageRows = if (session == null || sleep == null) {
        emptyList()
    } else {
        listOf(
            StageRowUi(SleepStage.DEEP, sleep.deepFraction?.let { it * 100.0 }, session.minutesDeep),
            StageRowUi(SleepStage.REM, sleep.remFraction?.let { it * 100.0 }, session.minutesRem),
            StageRowUi(SleepStage.LIGHT, sleep.lightFraction?.let { it * 100.0 }, session.minutesLight),
            StageRowUi(SleepStage.AWAKE, null, session.minutesAwake),
        )
    }

    val spread = sleep?.onsetStdDevMinutes
    val insight = sleep?.let {
        SleepInsightUi(
            sufficient = it.sufficientForRecovery,
            deficitMinutes = it.deficitMinutes,
            bedtimeSpreadMinutes = spread.takeIf { _ ->
                val status = parts.firstOrNull { it.component == SleepComponent.CONSISTENCY }?.status
                status != null && status != ContributorStatus.Optimal
            },
        )
    }

    val latencyReading = session?.let { SleepLatency.reading(it.minutesToFallAsleep, it.provenance) }
    val last = a.sleepNeedLastNight
    return SleepUi(
        score = mapper.sleep(a),
        scoreStatus = sleep?.let { SleepBands.overall(it).toStatus() },
        parts = parts,
        partial = sleep?.let(::partialScoreOf),
        asleepMinutes = sleep?.asleepMinutes,
        targetMinutes = sleep?.durationTargetMinutes,
        bedtimeSpreadMinutes = spread,
        hasSession = session != null,
        hasStageDetail = session?.hasStages == true,
        segments = segmentsOf(detail.stages),
        zoneOffsetSeconds = session?.startZoneOffsetSeconds,
        stageRows = stageRows,
        timeInBed = session?.let { mapper.value(it.minutesInBed / 60.0, 1, "h", measured) } ?: gone,
        latency = latencyReading?.let { mapper.value(it.minutes.toDouble(), 0, "min", it.provenance) }
            ?: MetricState.Unavailable(MetricReason.NO_DATA),
        latencyNotMeasured = latencyReading?.note == SleepLatencyNote.ZERO_LIKELY_NOT_MEASURED,
        wakeBouts = session?.wakeBoutsOverThreeMinutes?.let { mapper.value(it.toDouble(), 0, null, measured) }
            ?: MetricState.Unavailable(MetricReason.NO_DATA),
        need = NeedUi(
            baseMinutes = last.baseMinutes,
            strainMinutes = last.strainSurchargeMinutes,
            debtMinutes = last.debtSurchargeMinutes,
            totalMinutes = last.totalMinutes,
            usesDefaultBase = last.baseSource == BaseNeedSource.DEFAULT,
            debtKnown = last.accumulatedDebtMinutes != null,
        ),
        needTonightMinutes = a.sleepNeedTonight.totalMinutes,
        suggestedBedtimeMinute = detail.suggestedBedtimeMinute,
        usualWakeMinute = detail.usualWakeMinute,
        insight = insight,
        sessionProvenance = measured,
        regularity = sleepRegularityState(a.sleepRegularity),
        hrDip = hrDipOf(a.heartRateDip),
        debt = sleepDebtState(a.sleepNeedTonight.accumulatedDebtMinutes),
    )
}
