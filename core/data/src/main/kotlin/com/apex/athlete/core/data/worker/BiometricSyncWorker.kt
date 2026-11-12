package com.apex.athlete.core.data.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.apex.athlete.core.data.dataGraph
import com.apex.athlete.core.data.sync.SyncReport
import kotlinx.coroutines.CancellationException

/**
 * Pulls the live sources (Google Health API, Health Connect) into the real store.
 *
 * - Uses `stores.realStore()`; the demo store is never touched, and the whole run is skipped (success,
 *   nothing done) while Demo mode is on. Periodic runs are also skipped when background sync is off;
 *   owner-started runs (`syncNow`) are not.
 * - Maps the [SyncReport] with [SyncOutcomes.classify]: transient failures return `Result.retry()`
 *   (WorkManager's exponential back-off, at most [SyncOutcomes.MAX_ATTEMPTS] runs), everything else is a
 *   success whose output carries a stable status code under [KEY_STATUS].
 * - Moves `settings.lastSyncMillis` on any run that brought something up to date, and calls
 *   `stores.notifyChanged()` when data was written or days were recomputed.
 * - Owner-started runs register as foreground in [SyncRunContext] so the Google client may use the
 *   foreground share of the request budget.
 * - On Android 9 to 11 an expedited run is a foreground service, so [getForegroundInfo] supplies a quiet
 *   notification (channel `apex_sync`, low importance, no health values). On Android 12+ expedited work
 *   runs as an expedited job and this is not used.
 *
 * Timing is approximate: Doze, App Standby and manufacturer battery limits can delay periodic runs.
 */
class BiometricSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val manual = inputData.getBoolean(KEY_MANUAL, false)
        val graph = applicationContext.dataGraph()
        val status = SyncRunStatusStore(applicationContext)
        val settings = graph.settings.currentSettings()
        if (settings.demoMode || (!manual && !settings.backgroundSync)) return Result.success(output(SyncCodes.SKIPPED))

        val store = try {
            graph.stores.realStore()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            status.record(SyncCodes.STORE_UNAVAILABLE, System.currentTimeMillis(), succeeded = false)
            return Result.failure(output(SyncCodes.STORE_UNAVAILABLE))
        }

        val report: SyncReport = try {
            SyncRunContext.withPriority(foreground = manual) { graph.syncOrchestrator.sync(store) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Only the type is kept: messages can carry URLs or payload fragments.
            val retry = runAttemptCount + 1 < SyncOutcomes.MAX_ATTEMPTS
            status.record(SyncCodes.FAILED, System.currentTimeMillis(), succeeded = false)
            return if (retry) Result.retry() else Result.success(output(SyncCodes.FAILED))
        }

        val outcome = SyncOutcomes.classify(report, runAttemptCount)
        if (outcome.success) graph.settings.update { it.copy(lastSyncMillis = report.finishedAtMillis) }
        if (report.recomputedDays > 0 || report.counts.totalWritten > 0) graph.stores.notifyChanged()
        status.record(outcome.code, report.finishedAtMillis, outcome.success)
        return if (outcome.retry) Result.retry() else Result.success(output(outcome.code))
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Sync", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while Apex updates your data"
                setShowBadge(false)
            },
        )
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Syncing")
            .setContentText("Updating your data")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()
        return if (Build.VERSION.SDK_INT >= 29) {
            ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun output(code: String): Data = workDataOf(KEY_STATUS to code)

    companion object {
        /** Input: true for an owner-started (expedited) run. */
        const val KEY_MANUAL = "manual"

        /** Output: a [SyncCodes] value. */
        const val KEY_STATUS = "status"
        const val CHANNEL_ID = "apex_sync"
        const val NOTIFICATION_ID = 4101
    }
}
