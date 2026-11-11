package com.hcwebhook.app

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.workDataOf

/**
 * One way in for syncs started outside the app: the Quick Settings tile, the home screen
 * widget and the broadcast intent for Tasker / MacroDroid. They share a one-minute limit.
 *
 * The sync runs as expedited WorkManager work. A broadcast receiver may not start a
 * foreground service from the background on Android 12+, but it may enqueue work.
 */
object SyncTrigger {
    /** Broadcast action. Send it to this app's package; Android does not deliver it otherwise. */
    const val ACTION_SYNC = "com.hcwebhook.app.ACTION_SYNC"
    const val EXTRA_SOURCE = "source"
    const val MIN_INTERVAL_MS = 60_000L
    private const val WORK_NAME = "triggered_sync"

    /** A clock that went backwards (e.g. a time change) does not block triggers. */
    internal fun allows(lastAcceptedMs: Long?, nowMs: Long): Boolean =
        lastAcceptedMs == null || nowMs < lastAcceptedMs || nowMs - lastAcceptedMs >= MIN_INTERVAL_MS

    /** Starts a sync. Returns false, and does nothing, when the last trigger was under a minute ago. */
    fun request(context: Context, source: String, nowMs: Long = System.currentTimeMillis()): Boolean {
        val prefs = PreferencesManager(context)
        if (!allows(prefs.getLastTriggerTime(), nowMs)) return false
        prefs.setLastTriggerTime(nowMs)
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .setInputData(workDataOf(SyncWorker.KEY_SYNC_TYPE to source))
            .build()
        // KEEP: a trigger while a triggered sync still runs does not start a second one.
        WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
        return true
    }
}
