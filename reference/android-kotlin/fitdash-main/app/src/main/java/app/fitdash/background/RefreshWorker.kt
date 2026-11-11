package app.fitdash.background

import android.content.Context
import android.util.Log
import androidx.glance.appwidget.updateAll
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.fitdash.health.Availability
import app.fitdash.health.CachedSnapshot
import app.fitdash.health.HealthReader
import app.fitdash.health.HealthSnapshot
import app.fitdash.health.PhoneSteps
import app.fitdash.health.SnapshotCache
import app.fitdash.health.readFresh
import app.fitdash.settings.SettingsStore
import app.fitdash.widget.FitdashWidget
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit
import kotlin.coroutines.cancellation.CancellationException

private const val WORK_NAME = "background-refresh"
private const val INTERVAL_HOURS = 2L

// Every two hours: save the phone's new steps when phone-only is on, read Health Connect into the cache when the background permission is granted, then redraw the widgets.
// Without the permission it only redraws, so the widget still rolls over to a new day.
class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        try {
            val reader = HealthReader(applicationContext)
            if (SettingsStore.get(applicationContext).flow.value.phoneOnly) PhoneSteps.sample(applicationContext, reader)
            val permission = if (reader.availability() == Availability.AVAILABLE) reader.backgroundPermission() else null
            if (permission != null && permission in reader.grantedPermissions()) BackgroundRefresh.read(applicationContext, reader, ZonedDateTime.now())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // A failed read waits for the next run; retrying soon would only drain the battery.
            Log.w("fitdash", "Background refresh failed", e)
        }
        FitdashWidget().updateAll(applicationContext)
        return Result.success()
    }
}

object BackgroundRefresh {
    suspend fun read(context: Context, reader: HealthReader, now: ZonedDateTime): HealthSnapshot {
        val store = SnapshotCache(context)
        val cached = store.load()
        val result = readFresh(reader, cached?.snapshot, cached?.readAt, cached?.fullReadAt, now)
        store.save(CachedSnapshot(result.snapshot, now.toInstant(), if (result.full) now.toInstant() else cached?.fullReadAt ?: now.toInstant()))
        return result.snapshot
    }

    fun apply(context: Context, enabled: Boolean) {
        val work = WorkManager.getInstance(context)
        if (!enabled) {
            work.cancelUniqueWork(WORK_NAME)
            return
        }
        val request = PeriodicWorkRequestBuilder<RefreshWorker>(INTERVAL_HOURS, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build())
            .build()
        work.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }
}
