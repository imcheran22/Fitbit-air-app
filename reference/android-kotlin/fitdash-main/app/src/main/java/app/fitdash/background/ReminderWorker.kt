package app.fitdash.background

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import app.fitdash.MainActivity
import app.fitdash.R
import app.fitdash.health.Availability
import app.fitdash.health.HealthReader
import app.fitdash.health.SnapshotCache
import app.fitdash.metrics.MetricKind
import app.fitdash.metrics.buildToday
import app.fitdash.metrics.morningAlert
import app.fitdash.metrics.morningAlertDue
import app.fitdash.metrics.moveDue
import app.fitdash.metrics.waterDue
import app.fitdash.metrics.wakingWindow
import app.fitdash.settings.SettingsStore
import app.fitdash.ui.formatNumber
import app.fitdash.ui.formatTempDelta
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZonedDateTime
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.coroutines.cancellation.CancellationException

private const val WORK_NAME = "reminders"
private const val CHANNEL = "reminders"
private const val WATER_ID = 1
private const val MOVE_ID = 2
private const val MORNING_ID = 3
private const val ACTION_ADD_WATER = "app.fitdash.ADD_WATER"

// Every hour in the waking day: a water reminder when behind pace, and a move nudge after a still hour.
// The morning vitals check runs first, once a day from 6 to 11 AM, on a fresh read since the cache may predate the night.
// Water falls back to the cached snapshot without background access; the move nudge needs live steps, so it waits for access.
class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val settings = SettingsStore.get(applicationContext).flow.value
        if (!NotificationManagerCompat.from(applicationContext).areNotificationsEnabled()) return Result.success()
        try {
            val reader = HealthReader(applicationContext)
            if (reader.availability() != Availability.AVAILABLE) return Result.success()
            val now = ZonedDateTime.now()
            val background = reader.backgroundPermission()
            val granted = background != null && background in reader.grantedPermissions()
            val sent = applicationContext.getSharedPreferences("reminders", Context.MODE_PRIVATE)
            var cached = SnapshotCache(applicationContext).load()?.snapshot
            val lastMorning = sent.getLong("morning", 0L).takeIf { it > 0 }?.let(Instant::ofEpochMilli)
            if (settings.morningAlert && granted && morningAlertDue(now, lastMorning)) {
                val fresh = try {
                    BackgroundRefresh.read(applicationContext, reader, now)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w("fitdash", "Morning read failed", e)
                    null
                }
                if (fresh != null) {
                    cached = fresh
                    val data = buildToday(fresh, now)
                    val readings = morningAlert(data.vitals, data.heart, data.series, data.date)
                    if (readings.isNotEmpty()) {
                        Reminders.notify(applicationContext, MORNING_ID, "Overnight vitals outside your range", readings.joinToString(" · ") {
                            val f = settings.fahrenheit && it.kind == MetricKind.SKIN_TEMP
                            "${it.label} ${if (f) formatTempDelta(it.value, true) else formatNumber(it.value)} ${if (f) "°F" else it.unit}"
                        })
                    }
                    sent.edit().putLong("morning", now.toInstant().toEpochMilli()).apply()
                }
            }
            val window = wakingWindow(cached?.sleep.orEmpty(), now, settings.sleepHours)
            if (now !in window) return Result.success()
            val live = if (granted) reader.nudgeInputs(now) else null
            val goal = settings.waterGoalMl / 1000.0
            val water = live?.waterLiters ?: cached?.waterDaily?.get(now.toLocalDate()) ?: 0.0
            val lastWater = sent.getLong("water", 0L).takeIf { it > 0 }?.let(Instant::ofEpochMilli)
            if (settings.waterReminders && waterDue(water, goal, now, window, lastWater)) {
                Reminders.notifyWater(applicationContext, water, goal)
                sent.edit().putLong("water", now.toInstant().toEpochMilli()).apply()
            }
            val lastMove = sent.getLong("move", 0L).takeIf { it > 0 }?.let(Instant::ofEpochMilli)
            if (settings.moveNudge && live != null && moveDue(live.stepsLastHour, live.latestSteps, now, window, lastMove)) {
                Reminders.notify(applicationContext, MOVE_ID, "Time to stretch your legs", "Under 250 steps in the last hour. A few minutes of walking helps.")
                sent.edit().putLong("move", now.toInstant().toEpochMilli()).apply()
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w("fitdash", "Reminder check failed", e)
        }
        return Result.success()
    }
}

// "+250 ml" on the water reminder: writes the glass to Health Connect without opening fitdash.
class WaterActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_ADD_WATER) return
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val reader = HealthReader(context)
                if (reader.addWater(0.25, Instant.now()) != null) {
                    val goal = SettingsStore.get(context).flow.value.waterGoalMl / 1000.0
                    Reminders.notify(context, WATER_ID, "Logged 250 ml", "%.2f of %.1f L today".format(Locale.ENGLISH, reader.nudgeInputs(ZonedDateTime.now()).waterLiters, goal), timeoutMillis = 4000)
                } else {
                    Reminders.notify(context, WATER_ID, "Couldn't log water", "Open fitdash to add it.")
                }
            } finally {
                pending.finish()
            }
        }
    }
}

object Reminders {
    fun apply(context: Context, enabled: Boolean) {
        val work = WorkManager.getInstance(context)
        if (!enabled) {
            work.cancelUniqueWork(WORK_NAME)
            return
        }
        val request = PeriodicWorkRequestBuilder<ReminderWorker>(1, TimeUnit.HOURS, 15, TimeUnit.MINUTES).build()
        work.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun notifyWater(context: Context, drunk: Double, goal: Double) {
        val add = PendingIntent.getBroadcast(
            context, 0, Intent(context, WaterActionReceiver::class.java).setAction(ACTION_ADD_WATER),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        notify(context, WATER_ID, "Time for a glass of water", "%.1f of %.1f L so far today".format(Locale.ENGLISH, drunk, goal)) {
            addAction(0, "+250 ml", add)
        }
    }

    fun notify(context: Context, id: Int, title: String, text: String, timeoutMillis: Long = 0, extra: NotificationCompat.Builder.() -> Unit = {}) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .setAutoCancel(true)
            .apply { if (timeoutMillis > 0) setTimeoutAfter(timeoutMillis) }
            .apply(extra)
            .build()
        if (NotificationManagerCompat.from(context).areNotificationsEnabled()) manager.notify(id, notification)
    }
}
