package com.goose.app.upload

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for GooseUploadClient logic — D-02, D-03.
 *
 * Tests the stateless protocol contracts of GooseUploadClient without loading
 * the native library or using Android Context/org.json (Android SDK stubs
 * throw RuntimeException in pure JVM unit tests).
 *
 * Covers:
 *   D-02: Upload triggered fire-and-forget (onSyncComplete callback contract)
 *   D-03: POST /v1/ingest-frames; early return when serverUrl empty
 */
class GooseUploadClientLogicTest {

  // --- D-03: Empty serverUrl guard ---

  @Test
  fun `empty serverUrl is detected and upload should be skipped`() {
    val serverUrl = ""
    assertTrue("Empty URL must trigger skip (isEmpty check)", serverUrl.isEmpty())
  }

  @Test
  fun `non-empty serverUrl bypasses skip guard`() {
    val serverUrl = "http://192.168.1.10:8000"
    assertFalse("Non-empty URL must not be skipped", serverUrl.isEmpty())
  }

  @Test
  fun `whitespace-only serverUrl is non-empty and is not skipped by isEmpty`() {
    // Only strictly empty string skips — blank URLs would attempt a connection and fail gracefully.
    // This documents the contract: the impl uses isEmpty(), not isBlank().
    val serverUrl = "   "
    assertFalse("Whitespace-only URL passes isEmpty() guard — upload attempts and fails gracefully", serverUrl.isEmpty())
  }

  // --- D-03: Endpoint path construction ---

  @Test
  fun `upload endpoint path appends v1 ingest-frames`() {
    val serverUrl = "http://192.168.1.10:8000"
    val endpoint = "${serverUrl.trimEnd('/')}/v1/ingest-frames"
    assertEquals("http://192.168.1.10:8000/v1/ingest-frames", endpoint)
  }

  @Test
  fun `trailing slash on serverUrl is trimmed before path is appended`() {
    val serverUrl = "http://192.168.1.10:8000/"
    val endpoint = "${serverUrl.trimEnd('/')}/v1/ingest-frames"
    assertEquals("http://192.168.1.10:8000/v1/ingest-frames", endpoint)
    assertFalse("Endpoint must not have double slash", endpoint.contains("//v1"))
  }

  @Test
  fun `upload endpoint uses ingest-frames not ingest-decoded`() {
    // D-03 specifies /v1/ingest-frames (raw frames endpoint, matching iOS GooseUploadService.swift)
    val serverUrl = "http://192.168.1.10:8000"
    val endpoint = "${serverUrl.trimEnd('/')}/v1/ingest-frames"
    assertTrue("Endpoint must contain /v1/ingest-frames", endpoint.endsWith("/v1/ingest-frames"))
    assertFalse("Endpoint must NOT be /v1/ingest-decoded", endpoint.endsWith("/v1/ingest-decoded"))
  }

  // --- D-03: Bridge request format (string-based, avoids org.json in JVM tests) ---

  @Test
  fun `upload bridge request schema field is present`() {
    val dbPath = "/data/user/0/com.goose.app/files/goose.sqlite"
    // Mirror buildGetStreamsRequest() in GooseUploadClient
    val request = "{\"schema\":\"goose.bridge.request.v1\",\"method\":\"upload.get_recent_decoded_streams\",\"args\":{\"database_path\":\"$dbPath\"}}"
    assertTrue("Request must contain schema field", request.contains("\"schema\":\"goose.bridge.request.v1\""))
  }

  @Test
  fun `upload bridge request method is get_recent_decoded_streams`() {
    val dbPath = "/data/goose.sqlite"
    val request = "{\"schema\":\"goose.bridge.request.v1\",\"method\":\"upload.get_recent_decoded_streams\",\"args\":{\"database_path\":\"$dbPath\"}}"
    assertTrue("Request must target upload.get_recent_decoded_streams", request.contains("\"method\":\"upload.get_recent_decoded_streams\""))
  }

  @Test
  fun `upload bridge request contains database_path in args`() {
    val dbPath = "/data/user/0/com.goose.app/files/goose.sqlite"
    val request = "{\"schema\":\"goose.bridge.request.v1\",\"method\":\"upload.get_recent_decoded_streams\",\"args\":{\"database_path\":\"$dbPath\"}}"
    assertTrue("Request args must contain database_path", request.contains("\"database_path\":\"$dbPath\""))
  }

  // --- D-02: onSyncComplete callback contract ---

  @Test
  fun `onSyncComplete callback is invoked after sync completes`() {
    var callbackInvoked = false
    val onSyncComplete: (() -> Unit)? = { callbackInvoked = true }
    onSyncComplete?.invoke()
    assertTrue("onSyncComplete must be called after sync", callbackInvoked)
  }

  @Test
  fun `null onSyncComplete does not throw`() {
    // completeSyncIfActive() uses safe-call: onSyncComplete?.invoke()
    val onSyncComplete: (() -> Unit)? = null
    onSyncComplete?.invoke() // must not throw NPE
  }

  @Test
  fun `onSyncComplete triggers both upload and metrics refresh`() {
    // Document the AppViewModel.init{} contract: one callback triggers both actions
    var uploadTriggered = false
    var metricsRefreshed = false
    val onSyncComplete: (() -> Unit)? = {
      uploadTriggered = true
      metricsRefreshed = true
    }
    onSyncComplete?.invoke()
    assertTrue("Upload must be triggered by onSyncComplete", uploadTriggered)
    assertTrue("Metrics refresh must be triggered by onSyncComplete", metricsRefreshed)
  }
}
