package com.apex.athlete.core.data.coach.ask

import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.data.pipeline.DayAnalysis
import java.util.Locale
import kotlin.math.roundToInt

/** The computed numbers of [this] day that [AskApexPayload] may carry. Missing values are left out, never filled. */
fun DayAnalysis.toAskFacts(): List<AskFact> = buildList {
    fun whole(v: Double) = v.roundToInt().toString()
    fun one(v: Double) = String.format(Locale.US, "%.1f", v)
    if (recovery.status == RecoveryStatus.SCORED) recovery.scorePercent?.let { add(AskFact(AskFactKind.RECOVERY, it.toString())) }
    hrv.current?.let { add(AskFact(AskFactKind.HRV, whole(it))) }
    hrv.baseline.center?.let { add(AskFact(AskFactKind.HRV_USUAL, whole(it))) }
    restingHeartRate.current?.let { add(AskFact(AskFactKind.RESTING_HR, whole(it))) }
    restingHeartRate.baseline.center?.let { add(AskFact(AskFactKind.RESTING_HR_USUAL, whole(it))) }
    sleep?.let {
        add(AskFact(AskFactKind.SLEEP_ASLEEP, whole(it.asleepMinutes)))
        add(AskFact(AskFactKind.SLEEP_NEED, whole(it.needMinutes)))
    }
    strain?.let { add(AskFact(AskFactKind.STRAIN, one(it.strain))) }
    strainTarget?.let {
        add(AskFact(AskFactKind.STRAIN_TARGET_LOW, one(it.low)))
        add(AskFact(AskFactKind.STRAIN_TARGET_HIGH, one(it.high)))
    }
}
