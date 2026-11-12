package com.apex.athlete.core.data.alerts

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/** Schedules [AlertWorker]: every six hours, plus once after the morning (08:30 local, rescheduled each day). */
object AlertScheduler {
    const val PERIODIC_NAME = "apex_alerts_periodic"
    const val MORNING_NAME = "apex_alerts_morning"
    internal const val KEY_MORNING = "morning"

    /** Turn the alert jobs on or off. Safe to call repeatedly (for example at every app start). */
    fun schedule(context: Context, enabled: Boolean) {
        val wm = WorkManager.getInstance(context.applicationContext)
        if (!enabled) {
            wm.cancelUniqueWork(PERIODIC_NAME)
            wm.cancelUniqueWork(MORNING_NAME)
            return
        }
        val periodic = PeriodicWorkRequestBuilder<AlertWorker>(6, TimeUnit.HOURS)
            .setConstraints(Constraints.Builder().setRequiresBatteryNotLow(true).build())
            .build()
        wm.enqueueUniquePeriodicWork(PERIODIC_NAME, ExistingPeriodicWorkPolicy.KEEP, periodic)
        scheduleMorning(context, keepIfQueued = true)
    }

    internal fun scheduleMorning(context: Context, keepIfQueued: Boolean = false) {
        val delay = AlertEngine.delayUntilNextMorning(System.currentTimeMillis(), ZoneId.systemDefault())
        val request = OneTimeWorkRequestBuilder<AlertWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(workDataOf(KEY_MORNING to true))
            .build()
        WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
            MORNING_NAME,
            if (keepIfQueued) ExistingWorkPolicy.KEEP else ExistingWorkPolicy.APPEND_OR_REPLACE,
            request,
        )
    }
}
