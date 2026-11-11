package com.hcwebhook.app

import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    private val syncManager = SyncManager(appContext)

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val syncType = inputData.getString(KEY_SYNC_TYPE) ?: "auto"
            val syncResult = syncManager.performSync(syncType = syncType)
            if (syncResult.isSuccess) {
                Result.success()
            } else {
                mapFailure(syncResult.exceptionOrNull())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            mapFailure(e)
        } catch (e: Exception) {
            Result.failure()
        }
    }

    /** Expedited work needs a notification on Android 11 and older. */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        SyncForegroundService.ensureNotificationChannel(applicationContext)
        val notification = NotificationCompat.Builder(applicationContext, SyncForegroundService.CHANNEL_ID)
            .setContentTitle(applicationContext.getString(R.string.sync_service_notification_title))
            .setContentText(applicationContext.getString(R.string.sync_service_notification_text))
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(FOREGROUND_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(FOREGROUND_ID, notification)
        }
    }

    private fun mapFailure(error: Throwable?): Result {
        return when (error) {
            is CancellationException -> throw error
            is IOException -> if (WebhookManager.isRetryableException(error)) Result.retry() else Result.failure()
            else -> Result.failure()
        }
    }

    companion object {
        const val KEY_SYNC_TYPE = "sync_type"
        private const val FOREGROUND_ID = 2002
    }
}
