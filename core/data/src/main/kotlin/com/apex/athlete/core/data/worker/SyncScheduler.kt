package com.apex.athlete.core.data.worker

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.workDataOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import java.util.concurrent.TimeUnit

/**
 * Schedules [BiometricSyncWorker].
 *
 * Periodic work runs about every 30 minutes while the network is available. "About": WorkManager
 * batches and defers work under Doze, App Standby and manufacturer battery limits, so the real interval
 * can be much longer and exact timing is never promised. Data is also pulled when the owner opens the
 * app or pulls to refresh ([syncNow]).
 */
object SyncScheduler {
    const val UNIQUE_PERIODIC = "apex-sync-periodic"
    const val UNIQUE_NOW = "apex-sync-now"

    private const val PERIOD_MINUTES = 30L

    /** Turns the periodic sync on or off. Safe to call again: unchanged work keeps its schedule. */
    fun schedulePeriodic(context: Context, enabled: Boolean) {
        val manager = WorkManager.getInstance(context.applicationContext)
        if (!enabled) {
            manager.cancelUniqueWork(UNIQUE_PERIODIC)
            return
        }
        val request = PeriodicWorkRequestBuilder<BiometricSyncWorker>(PERIOD_MINUTES, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
            .build()
        manager.enqueueUniquePeriodicWork(UNIQUE_PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    /**
     * One sync now, started by the owner. Expedited; if the expedited quota is used up it runs as normal
     * work instead. A run already queued or running is kept, so repeated taps do not stack.
     */
    fun syncNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<BiometricSyncWorker>()
            .setInputData(workDataOf(BiometricSyncWorker.KEY_MANUAL to true))
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(UNIQUE_NOW, ExistingWorkPolicy.KEEP, request)
    }

    /** What the screens show: running now, the last result, or that a new sign-in is needed. */
    fun observe(context: Context): Flow<SyncRunState> {
        val app = context.applicationContext
        val manager = WorkManager.getInstance(app)
        return combine(
            manager.getWorkInfosForUniqueWorkFlow(UNIQUE_PERIODIC),
            manager.getWorkInfosForUniqueWorkFlow(UNIQUE_NOW),
            SyncRunStatusStore(app).observe(),
        ) { periodic, now, last ->
            val running = periodic.any { it.state == WorkInfo.State.RUNNING } ||
                now.any { it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED }
            SyncOutcomes.stateFor(running, last)
        }.distinctUntilChanged()
    }
}
