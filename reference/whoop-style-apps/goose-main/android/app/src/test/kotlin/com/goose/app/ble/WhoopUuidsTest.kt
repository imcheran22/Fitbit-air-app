package com.goose.app.ble

import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

/**
 * Unit tests for WhoopUuids — verifies UUID constants and helper functions
 * required by AND-02 (Android BLE stack parity with iOS CoreBluetoothBLETransport).
 */
class WhoopUuidsTest {

  // --- UUID constant correctness ---

  @Test
  fun `GEN4_SERVICE UUID matches expected string`() {
    assertEquals(
      UUID.fromString("61080001-8d6d-82b8-614a-1c8cb0f8dcc6"),
      WhoopUuids.GEN4_SERVICE,
    )
  }

  @Test
  fun `GEN5_SERVICE UUID matches expected string`() {
    assertEquals(
      UUID.fromString("fd4b0001-cce1-4033-93ce-002d5875f58a"),
      WhoopUuids.GEN5_SERVICE,
    )
  }

  @Test
  fun `GEN4_NOTIFY_CHARS contains exactly 4 entries`() {
    assertEquals(4, WhoopUuids.GEN4_NOTIFY_CHARS.size)
  }

  @Test
  fun `GEN5_NOTIFY_CHARS contains exactly 4 entries`() {
    assertEquals(4, WhoopUuids.GEN5_NOTIFY_CHARS.size)
  }

  @Test
  fun `GEN4_NOTIFY_CHARS first entry is 61080003 suffix`() {
    assertTrue(
      WhoopUuids.GEN4_NOTIFY_CHARS.contains(
        UUID.fromString("61080003-8d6d-82b8-614a-1c8cb0f8dcc6"),
      ),
    )
  }

  @Test
  fun `GEN5_NOTIFY_CHARS first entry is fd4b0003 suffix`() {
    assertTrue(
      WhoopUuids.GEN5_NOTIFY_CHARS.contains(
        UUID.fromString("fd4b0003-cce1-4033-93ce-002d5875f58a"),
      ),
    )
  }

  @Test
  fun `CCCD_UUID matches standard BLE descriptor UUID`() {
    assertEquals(
      UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"),
      WhoopUuids.CCCD_UUID,
    )
  }

  // --- isWhoopService ---

  @Test
  fun `isWhoopService returns true for GEN4_SERVICE`() {
    assertTrue(WhoopUuids.isWhoopService(WhoopUuids.GEN4_SERVICE))
  }

  @Test
  fun `isWhoopService returns true for GEN5_SERVICE`() {
    assertTrue(WhoopUuids.isWhoopService(WhoopUuids.GEN5_SERVICE))
  }

  @Test
  fun `isWhoopService returns false for unknown UUID`() {
    assertFalse(WhoopUuids.isWhoopService(UUID.randomUUID()))
  }

  @Test
  fun `isWhoopService returns false for CCCD_UUID`() {
    assertFalse(WhoopUuids.isWhoopService(WhoopUuids.CCCD_UUID))
  }

  // --- isGen4 ---

  @Test
  fun `isGen4 returns true for GEN4_SERVICE`() {
    assertTrue(WhoopUuids.isGen4(WhoopUuids.GEN4_SERVICE))
  }

  @Test
  fun `isGen4 returns false for GEN5_SERVICE`() {
    assertFalse(WhoopUuids.isGen4(WhoopUuids.GEN5_SERVICE))
  }

  @Test
  fun `isGen4 returns false for random UUID`() {
    assertFalse(WhoopUuids.isGen4(UUID.randomUUID()))
  }

  // --- notifyCharsFor ---

  @Test
  fun `notifyCharsFor GEN4_SERVICE returns GEN4_NOTIFY_CHARS`() {
    assertEquals(WhoopUuids.GEN4_NOTIFY_CHARS, WhoopUuids.notifyCharsFor(WhoopUuids.GEN4_SERVICE))
  }

  @Test
  fun `notifyCharsFor GEN5_SERVICE returns GEN5_NOTIFY_CHARS`() {
    assertEquals(WhoopUuids.GEN5_NOTIFY_CHARS, WhoopUuids.notifyCharsFor(WhoopUuids.GEN5_SERVICE))
  }

  @Test
  fun `notifyCharsFor unknown UUID returns empty list`() {
    assertTrue(WhoopUuids.notifyCharsFor(UUID.randomUUID()).isEmpty())
  }

  // --- commandCharFor ---

  @Test
  fun `commandCharFor GEN4_SERVICE returns GEN4_COMMAND`() {
    assertEquals(WhoopUuids.GEN4_COMMAND, WhoopUuids.commandCharFor(WhoopUuids.GEN4_SERVICE))
  }

  @Test
  fun `commandCharFor GEN5_SERVICE returns GEN5_COMMAND`() {
    assertEquals(WhoopUuids.GEN5_COMMAND, WhoopUuids.commandCharFor(WhoopUuids.GEN5_SERVICE))
  }

  @Test
  fun `GEN4_COMMAND and GEN5_COMMAND are distinct UUIDs`() {
    assertNotEquals(WhoopUuids.GEN4_COMMAND, WhoopUuids.GEN5_COMMAND)
  }

  @Test
  fun `GEN4_SERVICE and GEN5_SERVICE are distinct UUIDs`() {
    assertNotEquals(WhoopUuids.GEN4_SERVICE, WhoopUuids.GEN5_SERVICE)
  }
}
