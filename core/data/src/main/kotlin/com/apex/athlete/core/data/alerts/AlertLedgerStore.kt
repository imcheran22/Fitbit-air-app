package com.apex.athlete.core.data.alerts

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.apexAlertLedger: DataStore<Preferences> by preferencesDataStore(name = "apex_alert_ledger")

/** The civil day each alert type was last raised, so a type fires at most once a day. Holds days only, no readings. */
class AlertLedgerStore(context: Context) {
    private val store = context.applicationContext.apexAlertLedger

    suspend fun load(): AlertLedger {
        val p = store.data.first()
        return AlertType.entries.mapNotNull { t -> p[key(t)]?.let { t to it } }.toMap()
    }

    suspend fun record(alerts: List<Alert>) {
        if (alerts.isEmpty()) return
        store.edit { p -> alerts.forEach { p[key(it.type)] = it.epochDay } }
    }

    /** Part of "Delete all my data". */
    suspend fun clear() {
        store.edit { it.clear() }
    }

    private fun key(t: AlertType) = longPreferencesKey("last_" + t.name.lowercase())
}
