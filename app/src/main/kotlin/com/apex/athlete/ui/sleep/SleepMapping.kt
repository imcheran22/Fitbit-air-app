package com.apex.athlete.ui.sleep

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.analytics.sleep.BaseNeedSource
import com.apex.athlete.core.analytics.sleep.DipCategory
import com.apex.athlete.core.analytics.sleep.DipMissing
import com.apex.athlete.core.analytics.sleep.HeartRateDipResult
import com.apex.athlete.core.analytics.sleep.SleepRegularity
import com.apex.athlete.core.analytics.sleep.SleepRegularityIndex
import com.apex.athlete.core.analytics.sleep.SleepComponent
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

/** Display bands for a 0..100 sleep figure. Presentation only: the figure itself comes from the engine. */
const val OPTIMAL_FROM_PERCENT = 85.0
const val SUFFICIENT_FROM_PERCENT = 70.0

fun statusOfPercent(percent: Double?): ContributorStatus? = when {
    percent == null || !percent.isFinite() -> null
    percent >= OPTIMAL_FROM_PERCENT -> ContributorStatus.Optimal
    percent >= SUFFICIENT_FROM_PERCENT -> ContributorStatus.Sufficient
    else -> ContributorStatus.Poor
}

/** One row of the summary card. [status] is null when the figure is missing. */
data class SleepRowUi(val state: MetricState, val status: ContributorStatus?)

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
    val hours: SleepRowUi,
    val asleepMinutes: Double?,
    val neededMinutes: Double?,
    val consistency: SleepRowUi,
    val bedtimeSpreadMinutes: Double?,
    val efficiency: SleepRowUi,
    val restorative: SleepRowUi,
    val hasSession: Boolean,
    val hasStageDetail: Boolean,
    val segments: List<HypnogramSegment>,
    /** UTC offset the session started at, so clock labels follow the place the night was slept in. */
    val zoneOffsetSeconds: Int?,
    val stageRows: List<StageRowUi>,
    val timeInBed: MetricState,
    val latency: MetricState,
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

private fun SleepScoreResult.subScore(component: SleepComponent): Double? =
    contributions.firstOrNull { it.component == component && it.available }?.subScore

fun buildSleepUi(detail: SleepDetailState, mapper: MetricStateMapper): SleepUi {
    val a = detail.analysis
    val sleep = a.sleep
    val session: SleepSessionEntity? = a.sleepSession
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    val measured = session?.provenance

    // One reason for every figure that needs the night: awaiting sync today, no data otherwise.
    val gone: MetricState = mapper.sleep(a).takeIf { sleep == null } ?: MetricState.Unavailable(MetricReason.NO_DATA)
    val row = { state: MetricState, pct: Double? -> SleepRowUi(state, statusOfPercent(pct)) }

    val durationPct = sleep?.subScore(SleepComponent.DURATION)
    val hours = if (sleep != null) {
        row(MetricState.Value(sleep.asleepMinutes / 60.0, 1, "h", measured), durationPct)
    } else {
        row(gone, null)
    }

    val consistencyPct = sleep?.subScore(SleepComponent.CONSISTENCY)
    val consistency = when {
        sleep == null -> row(gone, null)
        consistencyPct == null -> row(MetricState.Calibrating(null), null)
        else -> row(MetricState.Value(consistencyPct, 0, "%", derived), consistencyPct)
    }

    val efficiencyPct = sleep?.efficiencyPercent
    val efficiency = when {
        sleep == null -> row(gone, null)
        efficiencyPct == null -> row(MetricState.Unavailable(MetricReason.NO_DATA), null)
        else -> row(MetricState.Value(efficiencyPct, 0, "%", derived), efficiencyPct)
    }

    val restorativePct = sleep?.restorativeFraction?.let { it * 100.0 }
    val restorative = when {
        sleep == null -> row(gone, null)
        restorativePct == null -> row(MetricState.Unavailable(MetricReason.NO_DATA), null)
        else -> row(MetricState.Value(restorativePct, 0, "%", derived), restorativePct)
    }

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
            bedtimeSpreadMinutes = spread.takeIf { _ -> consistency.status != null && consistency.status != ContributorStatus.Optimal },
        )
    }

    val last = a.sleepNeedLastNight
    return SleepUi(
        score = mapper.sleep(a),
        scoreStatus = statusOfPercent(sleep?.scorePercent?.toDouble()),
        hours = hours,
        asleepMinutes = sleep?.asleepMinutes,
        neededMinutes = sleep?.needMinutes,
        consistency = consistency,
        bedtimeSpreadMinutes = spread,
        efficiency = efficiency,
        restorative = restorative,
        hasSession = session != null,
        hasStageDetail = session?.hasStages == true,
        segments = segmentsOf(detail.stages),
        zoneOffsetSeconds = session?.startZoneOffsetSeconds,
        stageRows = stageRows,
        timeInBed = session?.let { mapper.value(it.minutesInBed / 60.0, 1, "h", measured) } ?: gone,
        latency = session?.minutesToFallAsleep?.let { mapper.value(it.toDouble(), 0, "min", measured) }
            ?: MetricState.Unavailable(MetricReason.NO_DATA),
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
