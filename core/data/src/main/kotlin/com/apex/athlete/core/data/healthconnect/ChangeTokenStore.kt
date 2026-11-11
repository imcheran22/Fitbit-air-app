package com.apex.athlete.core.data.healthconnect

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import java.util.concurrent.ConcurrentHashMap

/**
 * Where the Health Connect change token of each stream is kept between runs. A token is an opaque
 * string with no health values in it. Tokens expire after about 30 days; the source then falls back
 * to a windowed read.
 */
interface ChangeTokenStore {
    suspend fun get(stream: String): String?
    suspend fun put(stream: String, token: String?)

    /** Forgets every token (part of "Delete all my data"). */
    suspend fun clearAll()
}

class InMemoryChangeTokenStore : ChangeTokenStore {
    private val tokens = ConcurrentHashMap<String, String>()
    override suspend fun get(stream: String): String? = tokens[stream]
    override suspend fun put(stream: String, token: String?) {
        if (token == null) tokens.remove(stream) else tokens[stream] = token
    }
    override suspend fun clearAll() = tokens.clear()
}

private val Context.apexHcTokenStore: DataStore<Preferences> by preferencesDataStore(name = "apex_hc_change_tokens")

/**
 * DataStore-backed tokens. A separate file from the settings store: the watermark table's cursor
 * column is rewritten by the orchestrator on every window, so it cannot carry these.
 */
class DataStoreChangeTokenStore(context: Context) : ChangeTokenStore {
    private val store = context.applicationContext.apexHcTokenStore

    override suspend fun get(stream: String): String? = store.data.first()[key(stream)]?.takeIf { it.isNotEmpty() }

    override suspend fun put(stream: String, token: String?) {
        store.edit { p -> if (token == null) p.remove(key(stream)) else p[key(stream)] = token }
    }

    override suspend fun clearAll() {
        store.edit { it.clear() }
    }

    private fun key(stream: String) = stringPreferencesKey("token_$stream")
}
