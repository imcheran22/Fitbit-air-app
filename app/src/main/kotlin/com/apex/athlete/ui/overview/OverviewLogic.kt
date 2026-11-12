package com.apex.athlete.ui.overview

import com.apex.athlete.core.analytics.trend.RangeStatus
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.ui.shell.SyncStatus

/** What the Overview shows. Pure so it can be unit tested. */
enum class OverviewPhase { Loading, Empty, Content }

/**
 * [loaded] is true only when the dashboard for the requested day has arrived. A result for another day
 * (the previous one, still held while the new day computes) counts as not loaded.
 */
fun overviewPhase(loaded: Boolean, hasAnyData: Boolean): OverviewPhase = when {
    !loaded -> OverviewPhase.Loading
    !hasAnyData -> OverviewPhase.Empty
    else -> OverviewPhase.Content
}

const val SYNC_STALE_AFTER_MILLIS: Long = 36L * 60 * 60 * 1000

/** The dot beside the sync text. Never synced, or older than 36 h, is Stale; the demo store has nothing to sync. */
fun syncStatusFor(
    loaded: Boolean,
    isDemo: Boolean,
    lastSyncMillis: Long?,
    nowMillis: Long,
    staleAfterMillis: Long = SYNC_STALE_AFTER_MILLIS,
): SyncStatus = when {
    !loaded -> SyncStatus.Stale
    isDemo -> SyncStatus.Ok
    lastSyncMillis == null -> SyncStatus.Stale
    nowMillis - lastSyncMillis > staleAfterMillis -> SyncStatus.Stale
    else -> SyncStatus.Ok
}

/** (outside, evaluated): readings with a personal range to compare against. No reading or calibrating is not counted. */
fun rangeCounts(statuses: List<RangeStatus>): Pair<Int, Int> {
    var outside = 0
    var evaluated = 0
    for (s in statuses) {
        when (s) {
            RangeStatus.ABOVE_NORMAL, RangeStatus.BELOW_NORMAL -> { outside++; evaluated++ }
            RangeStatus.WITHIN_NORMAL -> evaluated++
            RangeStatus.NO_READING, RangeStatus.CALIBRATING -> Unit
        }
    }
    return outside to evaluated
}

/** Which way is the favourable direction for the comparison arrow on a monitor row. */
fun goodDirectionFor(metric: MetricType): GoodDirection = when (metric) {
    MetricType.HRV_RMSSD, MetricType.HRV_DEEP_SLEEP_RMSSD, MetricType.SPO2_AVG -> GoodDirection.UP
    MetricType.RESTING_HEART_RATE, MetricType.SLEEPING_HEART_RATE -> GoodDirection.DOWN
    else -> GoodDirection.NEUTRAL
}

/** Decimals used for a metric's baseline average; matches the display table of the state mapper. */
fun averageDecimalsFor(metric: MetricType): Int = when (metric) {
    MetricType.RESPIRATORY_RATE, MetricType.SPO2_AVG, MetricType.SKIN_TEMP_DEVIATION -> 1
    else -> 0
}
