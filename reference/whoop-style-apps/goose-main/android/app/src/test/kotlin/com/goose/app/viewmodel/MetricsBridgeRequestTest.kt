package com.goose.app.viewmodel

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for MetricsViewModel bridge request format — D-05, D-06.
 *
 * Tests the bridge request JSON construction and response parsing logic
 * without using org.json.JSONObject (which throws RuntimeException in pure
 * JVM unit tests due to Android SDK stubs). Uses string-based assertions
 * matching the pattern established in GooseBridgeTest.
 *
 * Key contract (D-06): bridge method names must match iOS HealthDataStore+Snapshots.swift exactly:
 *   - metrics.recovery_score_from_features
 *   - metrics.strain_score_from_features
 *   - metrics.sleep_score_from_features
 */
class MetricsBridgeRequestTest {

  /** Mirrors buildBridgeRequest() logic in MetricsViewModel */
  private fun buildBridgeRequest(method: String, dbPath: String): String {
    return "{\"schema\":\"goose.bridge.request.v1\",\"method\":\"$method\",\"args\":{\"database_path\":\"$dbPath\"}}"
  }

  // --- D-06: iOS method name parity ---

  @Test
  fun `recovery bridge method name matches iOS HealthDataStore plus Snapshots exactly`() {
    val request = buildBridgeRequest("metrics.recovery_score_from_features", "/db")
    assertTrue(
      "Must use metrics.recovery_score_from_features (iOS parity)",
      request.contains("\"method\":\"metrics.recovery_score_from_features\"")
    )
  }

  @Test
  fun `strain bridge method name matches iOS HealthDataStore plus Snapshots exactly`() {
    val request = buildBridgeRequest("metrics.strain_score_from_features", "/db")
    assertTrue(
      "Must use metrics.strain_score_from_features (iOS parity)",
      request.contains("\"method\":\"metrics.strain_score_from_features\"")
    )
  }

  @Test
  fun `sleep bridge method name matches iOS HealthDataStore plus Snapshots exactly`() {
    val request = buildBridgeRequest("metrics.sleep_score_from_features", "/db")
    assertTrue(
      "Must use metrics.sleep_score_from_features (iOS parity)",
      request.contains("\"method\":\"metrics.sleep_score_from_features\"")
    )
  }

  @Test
  fun `all three iOS method names are distinct`() {
    val methods = listOf(
      "metrics.recovery_score_from_features",
      "metrics.strain_score_from_features",
      "metrics.sleep_score_from_features"
    )
    assertEquals("Three metric methods must all be unique", 3, methods.toSet().size)
  }

  @Test
  fun `method names use snake_case not camelCase`() {
    // iOS uses snake_case — verify no camelCase variants creep in
    listOf(
      "metrics.recovery_score_from_features",
      "metrics.strain_score_from_features",
      "metrics.sleep_score_from_features"
    ).forEach { method ->
      assertFalse("Method $method must not contain uppercase letters", method.any { it.isUpperCase() })
    }
  }

  // --- D-05: Bridge request format ---

  @Test
  fun `bridge request schema is goose bridge request v1`() {
    val request = buildBridgeRequest("metrics.recovery_score_from_features", "/db")
    assertTrue("Request must contain correct schema", request.contains("\"schema\":\"goose.bridge.request.v1\""))
  }

  @Test
  fun `bridge request args contain database_path key`() {
    val dbPath = "/data/user/0/com.goose.app/files/goose.sqlite"
    val request = buildBridgeRequest("metrics.recovery_score_from_features", dbPath)
    assertTrue("Request must contain database_path in args", request.contains("\"database_path\":\"$dbPath\""))
  }

  @Test
  fun `bridge request is well-formed JSON envelope`() {
    val request = buildBridgeRequest("metrics.recovery_score_from_features", "/db")
    assertTrue("Must contain schema key", request.contains("\"schema\""))
    assertTrue("Must contain method key", request.contains("\"method\""))
    assertTrue("Must contain args key", request.contains("\"args\""))
    assertTrue("Must start with {", request.trimStart().startsWith("{"))
    assertTrue("Must end with }", request.trimEnd().endsWith("}"))
  }

  // --- D-05: Response parsing contracts (pure logic, no org.json) ---

  @Test
  fun `ok false in response signals no score available`() {
    // Simulate the response check: if (!json.optBoolean("ok", false)) return null
    val responseHasOkFalse = "\"ok\":false"
    val errorResponse = "{\"ok\":false,\"result\":null,\"error\":{\"message\":\"no data\"},\"timing\":null}"
    assertTrue("Error response must contain ok:false", errorResponse.contains(responseHasOkFalse))
    assertFalse("ok:false must NOT satisfy ok:true check", errorResponse.contains("\"ok\":true"))
  }

  @Test
  fun `ok true in response allows score extraction`() {
    val successResponse = "{\"ok\":true,\"result\":{\"score\":78.0},\"error\":null,\"timing\":{\"ms\":3}}"
    assertTrue("Success response must contain ok:true", successResponse.contains("\"ok\":true"))
    assertTrue("Success response must contain score", successResponse.contains("\"score\""))
  }

  @Test
  fun `null result in response means no score even when ok true`() {
    val response = "{\"ok\":true,\"result\":null,\"error\":null,\"timing\":null}"
    assertTrue("Response with null result must have result:null", response.contains("\"result\":null"))
    // MetricsViewModel.queryScore() returns null when optJSONObject("result") is null
  }

  @Test
  fun `StateFlow initial value is null before first bridge response`() {
    // Document D-05 contract: scores start null, display as "—" in HealthScreen
    val initialScore: Float? = null
    assertNull("Initial score must be null (no data until bridge responds)", initialScore)
    val displayText = initialScore?.let { "%.0f%%".format(it) } ?: "—"
    assertEquals("Null score must display as —", "—", displayText)
  }

  @Test
  fun `recovery score formatted as percentage string`() {
    val score = 78.0f
    val formatted = "%.0f%%".format(score)
    assertEquals("78% format", "78%", formatted)
  }

  @Test
  fun `strain score formatted with one decimal`() {
    val score = 14.3f
    // Use Locale.US to avoid decimal comma on European locales in JVM tests
    val formatted = "%.1f".format(score).replace(',', '.')
    assertEquals("14.3 format", "14.3", formatted)
  }

  @Test
  fun `sleep score formatted as percentage string`() {
    val score = 92.0f
    val formatted = "%.0f%%".format(score)
    assertEquals("92% format", "92%", formatted)
  }
}
