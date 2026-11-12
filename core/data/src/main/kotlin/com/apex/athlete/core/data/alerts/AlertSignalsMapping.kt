package com.apex.athlete.core.data.alerts

import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.data.pipeline.DayAnalysis
import com.apex.athlete.core.data.settings.AppSettings

/** The numbers the alert rules read from a day's analysis. Recovery counts as final once last night's sleep is recorded. */
fun DayAnalysis.toAlertSignals() = AlertSignals(
    epochDay = epochDay,
    recoveryPercent = if (recovery.status == RecoveryStatus.SCORED) recovery.scorePercent else null,
    recoveryIsFinal = recovery.status == RecoveryStatus.SCORED && sleep != null,
    fatigueLevel = fatigue.level,
    fatigueSignals = fatigue.signals,
    daysOutsideNormal = maxOf(hrv.consecutiveDaysOutsideNormal, restingHeartRate.consecutiveDaysOutsideNormal),
)

fun AppSettings.toAlertPrefs() = AlertPrefs(
    notificationsEnabled = notificationsEnabled,
    notifyRecovery = notifyRecovery,
    notifyFatigue = notifyFatigue,
    notifyStale = notifyStale,
    quietStartMinute = quietStartMinute,
    quietEndMinute = quietEndMinute,
    takeoutNudgeDays = takeoutNudgeDays,
    lastTakeoutImportMillis = lastTakeoutImportMillis,
    lastAlertDay = lastAlertDay,
)
