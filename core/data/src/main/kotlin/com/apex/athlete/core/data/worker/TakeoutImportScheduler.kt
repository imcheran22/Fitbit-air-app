package com.apex.athlete.core.data.worker

import android.content.Context
import android.net.Uri
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.hasKeyWithValueOfType
import androidx.work.workDataOf
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * Starts, watches and stops the archive import ([TakeoutImportWorker]) as unique work, so a second
 * pick while one is queued or running does not start a second import.
 *
 * The content URIs are part of the work's input so the import can resume by itself after the
 * process dies; WorkManager keeps them until the finished work is pruned ([cancel] prunes it). The
 * caller must already hold a persisted read permission for each URI.
 */
object TakeoutImportScheduler {
    const val UNIQUE = "apex-takeout-import"

    /** Imports one archive file. */
    fun enqueue(context: Context, uri: Uri, force: Boolean = false) = enqueue(context, listOf(uri), force)

    /** Imports an archive split over several ZIP files (the export may come in parts). A queued or running import is kept. */
    fun enqueue(context: Context, uris: List<Uri>, force: Boolean = false) {
        require(uris.isNotEmpty()) { "no archive picked" }
        val request = OneTimeWorkRequestBuilder<TakeoutImportWorker>()
            .setInputData(
                workDataOf(
                    TakeoutImportWorker.KEY_URIS to uris.map { it.toString() }.toTypedArray(),
                    TakeoutImportWorker.KEY_FORCE to force,
                ),
            )
            // The import writes a lot; do not start it when storage is nearly full.
            .setConstraints(Constraints.Builder().setRequiresStorageNotLow(true).build())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(UNIQUE, ExistingWorkPolicy.KEEP, request)
    }

    /** What the Takeout screen shows. */
    fun observe(context: Context): Flow<TakeoutImportState> =
        WorkManager.getInstance(context.applicationContext).getWorkInfosForUniqueWorkFlow(UNIQUE)
            .map { infos -> stateOf(infos.lastOrNull()) }
            .distinctUntilChanged()

    /**
     * Stops a queued or running import and forgets finished ones. Rows already committed stay; the
     * per-file marks let a later import continue where this one stopped.
     */
    fun cancel(context: Context) {
        val manager = WorkManager.getInstance(context.applicationContext)
        manager.cancelUniqueWork(UNIQUE)
        manager.pruneWork()
    }

    /** The values of the keys this feature writes, read with typed getters (no reflection on the whole bundle). */
    private fun Data.toMap(): Map<String, Any?> = buildMap {
        for (key in TakeoutImportCodec.INT_KEYS) if (hasKeyWithValueOfType<Int>(key)) put(key, getInt(key, 0))
        for (key in TakeoutImportCodec.LONG_KEYS) if (hasKeyWithValueOfType<Long>(key)) put(key, getLong(key, 0L))
        for (key in TakeoutImportCodec.BOOLEAN_KEYS) if (hasKeyWithValueOfType<Boolean>(key)) put(key, getBoolean(key, false))
        for (key in TakeoutImportCodec.STRING_KEYS) if (hasKeyWithValueOfType<String>(key)) put(key, getString(key))
    }

    private fun stateOf(info: WorkInfo?): TakeoutImportState {
        if (info == null) return TakeoutImportState.Idle
        val phase = when (info.state) {
            WorkInfo.State.ENQUEUED, WorkInfo.State.RUNNING, WorkInfo.State.BLOCKED -> TakeoutWorkPhase.QUEUED_OR_RUNNING
            WorkInfo.State.SUCCEEDED -> TakeoutWorkPhase.SUCCEEDED
            WorkInfo.State.FAILED -> TakeoutWorkPhase.FAILED
            WorkInfo.State.CANCELLED -> TakeoutWorkPhase.STOPPED
        }
        return TakeoutStateMapper.map(phase, info.progress.toMap(), info.outputData.toMap())
    }
}
