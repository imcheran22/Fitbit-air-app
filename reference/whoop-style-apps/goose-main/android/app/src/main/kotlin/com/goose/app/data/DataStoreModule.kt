package com.goose.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore

/**
 * Top-level DataStore delegate — must be defined at package level (not inside a class).
 * Single DataStore instance per process, keyed by "goose_settings".
 */
val Context.gooseDataStore: DataStore<Preferences> by preferencesDataStore(name = "goose_settings")

/** DataStore key for server URL. Default: empty string (upload disabled). */
val SERVER_URL_KEY = stringPreferencesKey("server_url")
