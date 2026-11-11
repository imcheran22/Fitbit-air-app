package com.goose.app.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.goose.app.bridge.GooseBridge
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * MetricsViewModel — fetches Recovery, Strain, and Sleep scores from the Rust bridge.
 *
 * Mirrors iOS HealthDataStore bridge call pattern:
 *   - metrics.recovery_score_from_features
 *   - metrics.strain_score_from_features
 *   - metrics.sleep_score_from_features
 *
 * All bridge calls run on Dispatchers.IO (GooseBridge.safeHandle() is blocking).
 * StateFlows are null until first successful bridge response.
 */
class MetricsViewModel(app: Application) : AndroidViewModel(app) {

  private val dbPath: String = app.filesDir.absolutePath + "/goose.sqlite"

  private val _recoveryScore = MutableStateFlow<Float?>(null)
  val recoveryScore: StateFlow<Float?> = _recoveryScore.asStateFlow()

  private val _strainScore = MutableStateFlow<Float?>(null)
  val strainScore: StateFlow<Float?> = _strainScore.asStateFlow()

  private val _sleepScore = MutableStateFlow<Float?>(null)
  val sleepScore: StateFlow<Float?> = _sleepScore.asStateFlow()

  init {
    refresh()
  }

  /** Refresh all metric scores from the Rust bridge. Safe to call from any thread. */
  fun refresh() {
    viewModelScope.launch(Dispatchers.IO) {
      _recoveryScore.value = queryScore("metrics.recovery_score_from_features")
      _strainScore.value = queryScore("metrics.strain_score_from_features")
      _sleepScore.value = queryScore("metrics.sleep_score_from_features")
    }
  }

  private fun queryScore(method: String): Float? {
    return try {
      val request = buildBridgeRequest(method)
      val response = GooseBridge.safeHandle(request)
      val json = JSONObject(response)
      if (!json.optBoolean("ok", false)) return null
      val result = json.optJSONObject("result") ?: return null
      val score = result.optDouble("score", -1.0)
      if (score < 0) null else score.toFloat()
    } catch (_: Exception) {
      null
    }
  }

  private fun buildBridgeRequest(method: String): String {
    val args = JSONObject().apply { put("database_path", dbPath) }
    return JSONObject().apply {
      put("schema", "goose.bridge.request.v1")
      put("method", method)
      put("args", args)
    }.toString()
  }
}
