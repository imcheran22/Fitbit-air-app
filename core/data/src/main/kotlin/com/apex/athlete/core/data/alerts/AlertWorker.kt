package com.apex.athlete.core.data.alerts

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.apex.athlete.core.data.dataGraph
import kotlinx.coroutines.CancellationException
import java.time.Instant
import java.time.ZoneId

/**
 * Evaluates the alert rules on the real store and posts what is due. Skips Demo mode entirely
 * (and so never reads the demo store). Never fails the schedule: any error means "try at the next run".
 */
class AlertWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val result = try {
            run()
            Result.success()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            Result.success() // nothing here is worth a retry storm; the next scheduled run looks again
        }
        // The morning run is a chain of one-time jobs: queue tomorrow's.
        if (inputData.getBoolean(AlertScheduler.KEY_MORNING, false)) AlertScheduler.scheduleMorning(applicationContext)
        return result
    }

    private suspend fun run() {
        val graph = applicationContext.dataGraph()
        val settings = graph.settings.currentSettings()
        if (settings.demoMode || !settings.notificationsEnabled) return

        val store = graph.stores.realStore()
        val zone = ZoneId.systemDefault()
        val now = System.currentTimeMillis()
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate().toEpochDay()

        val signals = try { store.pipeline.analyze(today, persist = false).toAlertSignals() } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
        val sleepEnd = store.db.sleepDao().sessionsBetween(today - 3, today).maxOfOrNull { it.endEpochMillis }
        val lastData = listOfNotNull(store.db.intradayHeartRateDao().latestTimestamp(), sleepEnd).maxOrNull()

        val ledgerStore = AlertLedgerStore(applicationContext)
        val decision = AlertEngine.decide(
            AlertInput(
                signals = signals, lastDataMillis = lastData, nowMillis = now, zone = zone, demoMode = false,
                prefs = settings.toAlertPrefs(), ledger = ledgerStore.load(),
            ),
        )
        if (decision.raise.isEmpty()) return

        val notifier = AlertNotifier(applicationContext)
        val posted = decision.raise.filter { notifier.post(it) }
        ledgerStore.record(posted)
        if (posted.isNotEmpty()) graph.settings.update { it.copy(lastAlertDay = today) }
    }
}
