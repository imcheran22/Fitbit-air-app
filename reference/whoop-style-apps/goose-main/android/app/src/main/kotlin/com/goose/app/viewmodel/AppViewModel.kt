package com.goose.app.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.goose.app.ble.WhoopBleClient
import com.goose.app.upload.GooseUploadClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * AppViewModel — central coordinator for the Android app.
 *
 * Owns WhoopBleClient lifecycle, wires post-sync callbacks:
 *   - MetricsViewModel.refresh() after sync (D-05)
 *   - GooseUploadClient.upload() after sync (D-02)
 *
 * Exposes delegated StateFlows for UI consumption:
 *   - connectionState, liveHeartRateBPM (from BLE)
 *   - recoveryScore, strainScore, sleepScore (from MetricsViewModel)
 *   - serverUrl, setServerUrl (from SettingsViewModel)
 */
class AppViewModel(app: Application) : AndroidViewModel(app) {

  val bleClient = WhoopBleClient(app.applicationContext)

  private val metricsViewModel = MetricsViewModel(app)
  private val settingsViewModel = SettingsViewModel(app)

  // BLE state delegation
  val connectionState = bleClient.connectionState
  val liveHeartRateBPM = bleClient.liveHeartRateBPM

  // Metrics delegation
  val recoveryScore: StateFlow<Float?> = metricsViewModel.recoveryScore
  val strainScore: StateFlow<Float?> = metricsViewModel.strainScore
  val sleepScore: StateFlow<Float?> = metricsViewModel.sleepScore

  // Settings delegation
  val serverUrl: StateFlow<String> = settingsViewModel.serverUrl
  fun setServerUrl(url: String) = settingsViewModel.setServerUrl(url)

  init {
    // Wire post-sync callback: refresh metrics + trigger upload (D-02)
    bleClient.onSyncComplete = {
      metricsViewModel.refresh()
      triggerUpload()
    }
  }

  /** Refresh metrics on demand (e.g., app foreground). */
  fun refreshMetrics() = metricsViewModel.refresh()

  private fun triggerUpload() {
    viewModelScope.launch(Dispatchers.IO) {
      GooseUploadClient.upload(getApplication(), serverUrl.value)
    }
  }

  override fun onCleared() {
    super.onCleared()
    bleClient.disconnect()
  }
}
