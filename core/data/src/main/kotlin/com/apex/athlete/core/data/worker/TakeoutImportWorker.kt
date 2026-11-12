package com.apex.athlete.core.data.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.apex.athlete.core.data.dataGraph
import com.apex.athlete.core.data.takeout.TakeoutArchivePart
import com.apex.athlete.core.data.takeout.TakeoutImportProgress
import com.apex.athlete.core.data.takeout.takeoutImporter
import kotlinx.coroutines.CancellationException
import java.io.IOException

/**
 * Imports a Google Takeout archive picked by the owner (`TakeoutZipImporter`) into the real store.
 *
 * - Input: [KEY_URIS], content URIs the owner picked, each with a persisted read permission
 *   (`takePersistableUriPermission`), and [KEY_FORCE] ("Force full re-import").
 * - Runs as foreground work of type `dataSync` with a quiet progress notification that shows
 *   "File X of Y" and a row count, never a health value, a file name or the URI. Progress is also
 *   published with `setProgress` ([TakeoutImportCodec] keys) for the screen. If the system does not
 *   allow a foreground start, the import continues as ordinary work.
 * - Streams every ZIP straight from the content resolver; nothing is copied to storage.
 * - Resumes after process death or a retry by itself: WorkManager restarts the work with the same
 *   input and the engine continues from its per-file marks, so nothing is imported twice.
 * - Writes only to `stores.realStore()`, and refuses to run (failure `demo_mode`) while Demo mode is on.
 * - When it finishes it sets `settings.lastTakeoutImportMillis` and calls `stores.notifyChanged()`.
 *
 * The output of a finished run is [TakeoutImportCodec] data, counts only.
 */
class TakeoutImportWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    @Volatile private var lastNotification: TakeoutImportState.Running = TakeoutImportState.Running(0, 0, 0, null)
    private var lastPublishedNanos = 0L
    private var lastNotificationNanos = 0L
    private var filesTotal = 0
    private var rowsSoFar = 0L

    override suspend fun doWork(): Result {
        val uris = inputData.getStringArray(KEY_URIS).orEmpty().filter { it.isNotBlank() }
        if (uris.isEmpty()) return Result.failure(failure(TakeoutFailure.NO_INPUT))

        val graph = applicationContext.dataGraph()
        // Demo data and real data never mix: nothing is read, nothing is written.
        if (graph.settings.currentSettings().demoMode) return Result.failure(failure(TakeoutFailure.DEMO_MODE))
        val store = try {
            graph.stores.realStore()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return Result.failure(failure(TakeoutFailure.STORE_UNAVAILABLE))
        }
        if (store.isDemo) return Result.failure(failure(TakeoutFailure.DEMO_MODE))

        startForeground()
        val resolver = applicationContext.contentResolver
        val parts = uris.mapIndexed { i, text ->
            val uri = Uri.parse(text)
            // The picked file's own name is never kept: parts are numbered.
            TakeoutArchivePart("part-${i + 1}") {
                resolver.openInputStream(uri) ?: throw IOException("archive not available")
            }
        }

        val report = try {
            graph.stores.takeoutImporter(store).import(parts, inputData.getBoolean(KEY_FORCE, false)) { progress -> publish(progress) }
        } catch (e: CancellationException) {
            // Committed batches, their marks and any owed recomputation stay; a later run continues from them.
            throw e
        } catch (e: Exception) {
            // Only the type is kept: messages can carry paths or fragments of the file.
            return if (runAttemptCount + 1 < MAX_ATTEMPTS) Result.retry() else Result.failure(failure(TakeoutFailure.FAILED))
        }

        TakeoutImportCodec.failureOf(report)?.let { return Result.failure(failure(it)) }
        graph.settings.update { it.copy(lastTakeoutImportMillis = report.finishedAtMillis) }
        if (report.rowsImported > 0 || report.recomputedDays > 0) graph.stores.notifyChanged()
        return Result.success(output(TakeoutImportCodec.outputData(TakeoutImportCodec.summaryOf(report))))
    }

    private suspend fun startForeground() {
        try {
            setForeground(getForegroundInfo())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Not allowed to start a foreground service right now: carry on as ordinary work.
        }
    }

    private suspend fun publish(progress: TakeoutImportProgress) {
        if (progress is TakeoutImportProgress.Importing) {
            filesTotal = progress.fileCount
            rowsSoFar = progress.rowsImported
        }
        val state = TakeoutImportCodec.running(progress, rowsSoFar, filesTotal)
        lastNotification = state
        // At most about two updates a second; the last update of a file or phase is not worth waiting for.
        val now = System.nanoTime()
        if (now - lastPublishedNanos < MIN_UPDATE_NANOS && !(progress is TakeoutImportProgress.Importing && progress.fileFinished)) return
        lastPublishedNanos = now
        setProgress(workDataOf(*TakeoutImportCodec.progressData(state).toPairs()))
        if (now - lastNotificationNanos >= NOTIFICATION_NANOS) {
            lastNotificationNanos = now
            startForeground()
        }
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Archive import", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while Apex imports a data archive"
                setShowBadge(false)
            },
        )
        val state = lastNotification
        val text = when {
            state.currentType == TakeoutPhase.INSPECTING || (state.filesTotal == 0 && state.currentType == null) -> "Reading the archive"
            state.currentType == TakeoutPhase.RECALCULATING -> "Recalculating your scores"
            else -> "File ${(state.filesDone + 1).coerceAtMost(state.filesTotal)} of ${state.filesTotal}, ${state.rowsWritten} rows"
        }
        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Importing archive")
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(state.filesTotal, state.filesDone.coerceAtMost(state.filesTotal), state.filesTotal == 0)
            .build()
        return if (Build.VERSION.SDK_INT >= 29) {
            ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun failure(code: String): Data = output(TakeoutImportCodec.failureData(code))

    private fun output(values: Map<String, Any>): Data = workDataOf(*values.toPairs())

    private fun Map<String, Any>.toPairs(): Array<Pair<String, Any>> = entries.map { it.key to it.value }.toTypedArray()

    companion object {
        /** Input: the picked content URIs as strings. */
        const val KEY_URIS = "uris"

        /** Input: "Force full re-import". */
        const val KEY_FORCE = "force"

        const val CHANNEL_ID = "apex_takeout"
        const val NOTIFICATION_ID = 4102

        /** Unexpected failures (storage, database) are retried this many runs in all, then reported. */
        const val MAX_ATTEMPTS = 3

        private const val MIN_UPDATE_NANOS = 500_000_000L
        private const val NOTIFICATION_NANOS = 2_000_000_000L
    }
}
