package com.apex.athlete.widget

import android.content.Context
import com.apex.athlete.core.data.repository.AthleteRepository
import com.apex.athlete.core.data.repository.HeartRateTick
import com.apex.athlete.core.data.settings.AppSettings
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.ui.common.ApexFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.atomic.AtomicLong

/**
 * Computes the [WidgetSnapshot] from [AthleteRepository] (the same dashboard the Overview shows), writes it to
 * [WidgetSnapshotStore] and asks the widgets to redraw. The widgets themselves never read the database.
 *
 * Demo isolation: nothing is published while Demo mode is on or onboarding is not finished, and a dashboard that
 * says it came from the demo store is dropped. In those cases the stored snapshot is removed instead, so every
 * widget shows the neutral "Open Apex" state.
 *
 * [clear] wins over a publish that is already running: it bumps a generation that the publisher checks right
 * before writing, so a slow publish cannot bring a deleted snapshot back.
 */
class WidgetPublisher(
    private val context: Context,
    private val repository: AthleteRepository,
    private val settings: SettingsStore,
    private val store: WidgetSnapshotStore,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
) {
    private val mutex = Mutex()
    private val generation = AtomicLong(0)

    /** Publishes the current state when a widget is installed and the owner's real data is live. */
    suspend fun publish() {
        mutex.withLock {
            val started = generation.get()
            val current = settings.currentSettings()
            if (!current.isLive()) {
                clearLocked()
                return
            }
            if (!WidgetUpdater.hasAnyWidget(context)) return
            WidgetRefreshWorker.schedule(context)

            val snapshot = build(current) ?: return
            if (snapshot.isDemo) {
                clearLocked()
                return
            }
            // Deleted, signed out or switched to Demo while the dashboard was computed: do not write.
            if (generation.get() != started) return
            if (!settings.currentSettings().isLive()) {
                clearLocked()
                return
            }
            if (store.write(snapshot)) WidgetUpdater.refreshAll(context)
        }
    }

    /** Removes the snapshot and redraws the widgets as "Open Apex". Call it on data deletion and when Demo mode starts. */
    suspend fun clear() {
        generation.incrementAndGet()
        mutex.withLock { clearLocked() }
    }

    private suspend fun clearLocked() {
        store.clear()
        WidgetUpdater.refreshAll(context)
    }

    private suspend fun build(current: AppSettings): WidgetSnapshot? {
        val today = repository.today()
        val dashboard = loadDashboard(today) ?: return null
        if (dashboard.isDemo) return demoMarker(dashboard.analysis.epochDay)
        val now = nowMillis()
        var heartRate: HeartRateTick? = dashboard.latestHeartRate
        if (heartRate?.bpm == null && localHour(now) < EARLY_HOURS) {
            // Just after midnight the last reading is usually from late yesterday; it still counts for six hours.
            heartRate = loadDashboard(today - 1)?.takeUnless { it.isDemo }?.latestHeartRate
        }
        val mapper = MetricStateMapper(ApexFormatter(context, current.units, current.clock24h))
        return WidgetSnapshotBuilder.build(dashboard, mapper, heartRate, now)
    }

    private suspend fun loadDashboard(day: Long) =
        withTimeoutOrNull(LOAD_TIMEOUT_MILLIS) { repository.dashboard(day).filterNotNull().first() }

    private fun localHour(now: Long): Int = Instant.ofEpochMilli(now).atZone(zone()).hour

    /** Stands in for "the repository served the demo store": publish() sees isDemo and clears instead of writing. */
    private fun demoMarker(epochDay: Long): WidgetSnapshot = WidgetSnapshot(
        updatedAtMillis = nowMillis(),
        epochDay = epochDay,
        isDemo = true,
        recovery = WidgetMetric.NO_DATA,
        sleep = WidgetMetric.NO_DATA,
        strain = WidgetMetric.NO_DATA,
        heartRateBpm = null,
        heartRateAtMillis = null,
        heartRateProvenance = null,
    )

    private fun AppSettings.isLive(): Boolean = onboardingDone && !demoMode

    private companion object {
        const val LOAD_TIMEOUT_MILLIS = 10_000L
        const val EARLY_HOURS = 6
    }
}
