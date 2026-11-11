package com.goose.app.ble

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for BleConnectionState sealed class and extension properties.
 * Covers AND-02: 7-state machine parity with iOS CoreBluetoothBLETransport.
 */
class BleConnectionStateTest {

  // --- State structure ---

  @Test
  fun `Idle is a BleConnectionState`() {
    val state: BleConnectionState = BleConnectionState.Idle
    assertTrue(state is BleConnectionState.Idle)
  }

  @Test
  fun `Scanning is a BleConnectionState`() {
    val state: BleConnectionState = BleConnectionState.Scanning
    assertTrue(state is BleConnectionState.Scanning)
  }

  @Test
  fun `Connecting carries device address`() {
    val state = BleConnectionState.Connecting("AA:BB:CC:DD:EE:FF")
    assertEquals("AA:BB:CC:DD:EE:FF", state.deviceAddress)
  }

  @Test
  fun `DiscoveringServices carries device address`() {
    val state = BleConnectionState.DiscoveringServices("11:22:33:44:55:66")
    assertEquals("11:22:33:44:55:66", state.deviceAddress)
  }

  @Test
  fun `Authenticating carries device address`() {
    val state = BleConnectionState.Authenticating("AA:BB:CC:DD:EE:FF")
    assertEquals("AA:BB:CC:DD:EE:FF", state.deviceAddress)
  }

  @Test
  fun `Connected carries device address and generation`() {
    val state = BleConnectionState.Connected("AA:BB:CC:DD:EE:FF", WhoopGeneration.GEN4)
    assertEquals("AA:BB:CC:DD:EE:FF", state.deviceAddress)
    assertEquals(WhoopGeneration.GEN4, state.generation)
  }

  @Test
  fun `Connected supports all three WhoopGeneration variants`() {
    val gen4 = BleConnectionState.Connected("addr", WhoopGeneration.GEN4)
    val gen5 = BleConnectionState.Connected("addr", WhoopGeneration.GEN5)
    val mg = BleConnectionState.Connected("addr", WhoopGeneration.MG)
    assertEquals(WhoopGeneration.GEN4, gen4.generation)
    assertEquals(WhoopGeneration.GEN5, gen5.generation)
    assertEquals(WhoopGeneration.MG, mg.generation)
  }

  @Test
  fun `Disconnected carries reason and willReconnect`() {
    val state = BleConnectionState.Disconnected("GATT error 133", willReconnect = true)
    assertEquals("GATT error 133", state.reason)
    assertTrue(state.willReconnect)
  }

  @Test
  fun `Disconnected willReconnect false when user disconnected`() {
    val state = BleConnectionState.Disconnected("user requested", willReconnect = false)
    assertFalse(state.willReconnect)
  }

  // --- isConnected extension ---

  @Test
  fun `isConnected is true only for Connected state`() {
    val connected = BleConnectionState.Connected("addr", WhoopGeneration.GEN5)
    assertTrue(connected.isConnected)
  }

  @Test
  fun `isConnected is false for Idle`() {
    assertFalse(BleConnectionState.Idle.isConnected)
  }

  @Test
  fun `isConnected is false for Scanning`() {
    assertFalse(BleConnectionState.Scanning.isConnected)
  }

  @Test
  fun `isConnected is false for Connecting`() {
    assertFalse(BleConnectionState.Connecting("addr").isConnected)
  }

  @Test
  fun `isConnected is false for DiscoveringServices`() {
    assertFalse(BleConnectionState.DiscoveringServices("addr").isConnected)
  }

  @Test
  fun `isConnected is false for Authenticating`() {
    assertFalse(BleConnectionState.Authenticating("addr").isConnected)
  }

  @Test
  fun `isConnected is false for Disconnected`() {
    assertFalse(BleConnectionState.Disconnected("reason", false).isConnected)
  }

  // --- deviceAddress extension ---

  @Test
  fun `deviceAddress extension returns address for Connecting`() {
    val state: BleConnectionState = BleConnectionState.Connecting("AA:BB:CC:DD:EE:FF")
    assertEquals("AA:BB:CC:DD:EE:FF", state.deviceAddress)
  }

  @Test
  fun `deviceAddress extension returns address for DiscoveringServices`() {
    val state: BleConnectionState = BleConnectionState.DiscoveringServices("AA:BB:CC:DD:EE:FF")
    assertEquals("AA:BB:CC:DD:EE:FF", state.deviceAddress)
  }

  @Test
  fun `deviceAddress extension returns address for Authenticating`() {
    val state: BleConnectionState = BleConnectionState.Authenticating("AA:BB:CC:DD:EE:FF")
    assertEquals("AA:BB:CC:DD:EE:FF", state.deviceAddress)
  }

  @Test
  fun `deviceAddress extension returns address for Connected`() {
    val state: BleConnectionState = BleConnectionState.Connected("AA:BB:CC:DD:EE:FF", WhoopGeneration.MG)
    assertEquals("AA:BB:CC:DD:EE:FF", state.deviceAddress)
  }

  @Test
  fun `deviceAddress extension returns null for Idle`() {
    assertNull(BleConnectionState.Idle.deviceAddress)
  }

  @Test
  fun `deviceAddress extension returns null for Scanning`() {
    assertNull(BleConnectionState.Scanning.deviceAddress)
  }

  @Test
  fun `deviceAddress extension returns null for Disconnected`() {
    assertNull(BleConnectionState.Disconnected("err", false).deviceAddress)
  }

  // --- WhoopGeneration enum ---

  @Test
  fun `WhoopGeneration has exactly three variants`() {
    assertEquals(3, WhoopGeneration.entries.size)
  }

  @Test
  fun `WhoopGeneration contains GEN4 GEN5 MG`() {
    val values = WhoopGeneration.entries.map { it.name }.toSet()
    assertEquals(setOf("GEN4", "GEN5", "MG"), values)
  }
}
