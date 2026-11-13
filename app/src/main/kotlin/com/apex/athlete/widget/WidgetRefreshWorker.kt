package com.apex.athlete.widget

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Redraws the widgets every 30 minutes from the snapshot file so "12 min ago" and the six-hour heart-rate cut-off
 * stay true between syncs. It reads one small file and opens no database and no network connection. Android may
 * delay it (Doze, standby); that only means the age text lags, never that a wrong number appears, because the age
 * is computed from the reading's own timestamp at each draw. It stops itself when no widget is left.
 */
class WidgetRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        if (!WidgetUpdater.hasAnyWidget(applicationContext)) {
            WorkManager.getInstance(applicationContext).cancelUniqueWork(UNIQUE_NAME)
            return Result.success()
        }
        WidgetUpdater.refreshAll(applicationContext)
        return Result.success()
    }

    companion object {
        const val UNIQUE_NAME = "apex-widget-refresh"
        const val PERIOD_MINUTES = 30L

        /** Keeps one periodic refresh queued; a no-op when it already is. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(PERIOD_MINUTES, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}
