package com.goose.app.upload

import android.content.Context
import android.util.Log
import com.goose.app.bridge.GooseBridge
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * GooseUploadClient — uploads captured frames to the configured server (D-03).
 *
 * Uses HttpURLConnection (no external HTTP library).
 * Upload is fire-and-forget — all exceptions are caught and logged.
 * Skips silently when serverUrl is empty (upload disabled).
 *
 * Endpoint: POST {serverUrl}/v1/ingest-frames
 * Mirrors iOS GooseUploadService.swift ingest-frames endpoint.
 */
object GooseUploadClient {

  private const val TAG = "GooseUpload"

  /**
   * Upload recent decoded streams to the configured server.
   *
   * Must be called from a background thread (Dispatchers.IO) — performs network I/O.
   *
   * @param context Android context for filesDir path
   * @param serverUrl Base server URL; empty string = skip upload
   */
  fun upload(context: Context, serverUrl: String) {
    if (serverUrl.isEmpty()) {
      Log.d(TAG, "Server URL not configured — skipping upload")
      return
    }

    try {
      val dbPath = context.filesDir.absolutePath + "/goose.sqlite"

      // Fetch pending frames from Rust bridge
      val bridgeRequest = buildGetStreamsRequest(dbPath)
      val bridgeResponse = GooseBridge.safeHandle(bridgeRequest)
      val responseJson = JSONObject(bridgeResponse)

      if (!responseJson.optBoolean("ok", false)) {
        Log.d(TAG, "upload.get_recent_decoded_streams failed: ${responseJson.optJSONObject("error")?.optString("message")}")
        return
      }

      val result = responseJson.optJSONObject("result")
      if (result == null || result.length() == 0) {
        Log.d(TAG, "No pending frames to upload")
        return
      }

      // POST payload to server
      val payload = result.toString().toByteArray(Charsets.UTF_8)
      val endpoint = "${serverUrl.trimEnd('/')}/v1/ingest-frames"
      postToServer(endpoint, payload)

    } catch (e: Exception) {
      Log.w(TAG, "Upload failed: ${e.message}")
    }
  }

  private fun buildGetStreamsRequest(dbPath: String): String {
    val args = JSONObject().apply { put("database_path", dbPath) }
    return JSONObject().apply {
      put("schema", "goose.bridge.request.v1")
      put("method", "upload.get_recent_decoded_streams")
      put("args", args)
    }.toString()
  }

  private fun postToServer(endpoint: String, payload: ByteArray) {
    var conn: HttpURLConnection? = null
    try {
      conn = URL(endpoint).openConnection() as HttpURLConnection
      conn.requestMethod = "POST"
      conn.setRequestProperty("Content-Type", "application/json")
      conn.setRequestProperty("Content-Length", payload.size.toString())
      conn.doOutput = true
      conn.connectTimeout = 10_000
      conn.readTimeout = 15_000

      conn.outputStream.use { it.write(payload) }

      val responseCode = conn.responseCode
      if (responseCode in 200..299) {
        Log.d(TAG, "Upload successful: HTTP $responseCode endpoint=$endpoint bytes=${payload.size}")
      } else {
        Log.w(TAG, "Upload HTTP error: $responseCode endpoint=$endpoint")
      }
    } catch (e: IOException) {
      Log.w(TAG, "Upload network error: ${e.message}")
    } finally {
      conn?.disconnect()
    }
  }
}
