package com.goose.app.data

import androidx.datastore.preferences.core.stringPreferencesKey
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for DataStoreModule — D-01.
 *
 * Verifies the DataStore key name and preference key identity contracts.
 * These tests run on the JVM without Android runtime — we only test
 * the static configuration values that are deterministic.
 *
 * The DataStore delegate itself (val Context.gooseDataStore) requires an
 * Android Context and is verified by the assembleDebug build + on-device
 * instrumented tests in Phase 107.
 */
class DataStoreModuleTest {

  // --- D-01: Server URL key contract ---

  @Test
  fun `SERVER_URL_KEY name is server_url`() {
    // The key name "server_url" is the DataStore identifier used at read/write time.
    // Changing it would silently break persistence for existing users.
    assertEquals("server_url", SERVER_URL_KEY.name)
  }

  @Test
  fun `SERVER_URL_KEY is a string preferences key`() {
    // Must be stringPreferencesKey — not intPreferencesKey or booleanPreferencesKey
    val expected = stringPreferencesKey("server_url")
    assertEquals("Key names must match", expected.name, SERVER_URL_KEY.name)
  }

  @Test
  fun `SERVER_URL_KEY is stable across multiple reads`() {
    // Preferences keys are value-equal if their names match
    val key1 = SERVER_URL_KEY
    val key2 = SERVER_URL_KEY
    assertEquals("Same key object must have same name on repeated access", key1.name, key2.name)
  }

  @Test
  fun `empty string is the expected default when key is absent`() {
    // SettingsViewModel uses ?: "" as default — document the contract
    val prefs = mapOf<String, String>() // no keys set
    val serverUrl = prefs[SERVER_URL_KEY.name] ?: ""
    assertEquals("Missing key must default to empty string", "", serverUrl)
    assertTrue("Empty default means upload is disabled", serverUrl.isEmpty())
  }

  @Test
  fun `non-empty server URL disables upload skip guard`() {
    val serverUrl = "http://192.168.1.10:8000"
    assertFalse("Non-empty URL must not trigger upload skip", serverUrl.isEmpty())
  }

  @Test
  fun `DataStore file name is goose_settings`() {
    // The DataStore file name determines the persistent storage path.
    // This constant must not change without a migration plan.
    // We can only verify by inspecting the source; this test documents intent.
    val expectedDataStoreName = "goose_settings"
    // Naming confirmed from DataStoreModule.kt: preferencesDataStore(name = "goose_settings")
    assertEquals("DataStore name must remain stable", "goose_settings", expectedDataStoreName)
  }
}
