package com.goose.app.viewmodel

import android.app.Application
import androidx.datastore.preferences.core.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.goose.app.data.SERVER_URL_KEY
import com.goose.app.data.gooseDataStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * SettingsViewModel — reads and writes server URL to Jetpack DataStore (D-01).
 *
 * serverUrl is a StateFlow<String>; empty string means upload is disabled.
 * setServerUrl() writes on Dispatchers.IO — never blocks the main thread.
 */
class SettingsViewModel(app: Application) : AndroidViewModel(app) {

  val serverUrl: StateFlow<String> = app.gooseDataStore.data
    .map { prefs -> prefs[SERVER_URL_KEY] ?: "" }
    .stateIn(
      scope = viewModelScope,
      started = SharingStarted.WhileSubscribed(5_000),
      initialValue = "",
    )

  /** Persist a new server URL. Empty string disables upload. */
  fun setServerUrl(url: String) {
    val application: Application = getApplication()
    viewModelScope.launch(Dispatchers.IO) {
      application.gooseDataStore.edit { prefs ->
        prefs[SERVER_URL_KEY] = url
      }
    }
  }
}
