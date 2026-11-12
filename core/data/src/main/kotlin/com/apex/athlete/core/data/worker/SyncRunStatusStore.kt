package com.apex.athlete.core.data.worker

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Remembers the outcome of the last finished sync run so the UI can show it even though periodic
 * WorkManager runs are re-enqueued (and lose their output) after every run. Holds a stable code and a
 * time only: no health values, tokens or messages.
 */
class SyncRunStatusStore(context: Context) {
    private val prefs: SharedPreferences = context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun record(code: String, atMillis: Long, succeeded: Boolean) {
        prefs.edit().putString(CODE, code).putLong(AT, atMillis).putBoolean(OK, succeeded).apply()
    }

    fun last(): LastRun? {
        val code = prefs.getString(CODE, null) ?: return null
        return LastRun(code, prefs.getLong(AT, 0L), prefs.getBoolean(OK, false))
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    fun observe(): Flow<LastRun?> = callbackFlow {
        // SharedPreferences keeps listeners weakly; this reference lives as long as the flow.
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> trySend(last()) }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        trySend(last())
        awaitClose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }

    private companion object {
        const val FILE = "apex_sync_status"
        const val CODE = "code"
        const val AT = "at"
        const val OK = "ok"
    }
}
