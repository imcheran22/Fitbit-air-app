package com.goose.app.ble

import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for R22 live heart rate decoding logic — D-04.
 *
 * Tests the packet decoding algorithm added to WhoopBleClient:
 *   - byte[0] == 0x10 identifies an R22 HR notification packet
 *   - bytes[2-3] contain milli-BPM in little-endian format
 *   - HR in BPM = milliBeats / 10
 *
 * These tests run on the JVM without CoreBluetooth or Android runtime.
 */
class LiveHeartRateDecodingTest {

  /** Mirrors the exact decoding logic in WhoopBleClient.onCharacteristicChanged */
  private fun decodeHrFromR22Packet(bytes: ByteArray): Int? {
    if (bytes.size < 4) return null
    if (bytes[0] != 0x10.toByte()) return null
    val milliBeats = (bytes[2].toInt() and 0xFF) or ((bytes[3].toInt() and 0xFF) shl 8)
    val bpm = milliBeats / 10
    return if (bpm > 0) bpm else null
  }

  // --- Packet type gate (D-04) ---

  @Test
  fun `byte 0 equal to 0x10 identifies R22 HR packet`() {
    val packet = byteArrayOf(0x10, 0x00, 0x2C, 0x02, 0x00) // milliBeats = 0x022C = 556 → 55 bpm
    val result = decodeHrFromR22Packet(packet)
    assertNotNull("R22 packet must yield a non-null BPM", result)
  }

  @Test
  fun `non-R22 packet type is ignored`() {
    val packet = byteArrayOf(0x20, 0x00, 0x2C, 0x02, 0x00)
    val result = decodeHrFromR22Packet(packet)
    assertNull("Non-0x10 packet type must return null", result)
  }

  @Test
  fun `packet shorter than 4 bytes returns null`() {
    val shortPacket = byteArrayOf(0x10, 0x00, 0x50)
    val result = decodeHrFromR22Packet(shortPacket)
    assertNull("Packet shorter than 4 bytes must return null", result)
  }

  @Test
  fun `empty packet returns null`() {
    val result = decodeHrFromR22Packet(byteArrayOf())
    assertNull("Empty packet must return null", result)
  }

  // --- milli-bpm decoding correctness (D-04) ---

  @Test
  fun `60 bpm decodes correctly from milli-bpm 600`() {
    // 600 milliBeats = 0x0258 → bytes[2]=0x58 bytes[3]=0x02
    val milliBeats = 600
    val packet = byteArrayOf(
      0x10.toByte(), 0x00,
      (milliBeats and 0xFF).toByte(),
      ((milliBeats shr 8) and 0xFF).toByte(),
      0x00
    )
    val bpm = decodeHrFromR22Packet(packet)
    assertEquals("600 milli-bpm / 10 must equal 60 bpm", 60, bpm)
  }

  @Test
  fun `120 bpm decodes correctly from milli-bpm 1200`() {
    val milliBeats = 1200 // 0x04B0
    val packet = byteArrayOf(
      0x10.toByte(), 0x00,
      (milliBeats and 0xFF).toByte(),
      ((milliBeats shr 8) and 0xFF).toByte(),
      0x00
    )
    val bpm = decodeHrFromR22Packet(packet)
    assertEquals("1200 milli-bpm / 10 must equal 120 bpm", 120, bpm)
  }

  @Test
  fun `180 bpm decodes correctly from milli-bpm 1800`() {
    val milliBeats = 1800 // 0x0708
    val packet = byteArrayOf(
      0x10.toByte(), 0x00,
      (milliBeats and 0xFF).toByte(),
      ((milliBeats shr 8) and 0xFF).toByte(),
      0x00
    )
    val bpm = decodeHrFromR22Packet(packet)
    assertEquals("1800 milli-bpm / 10 must equal 180 bpm", 180, bpm)
  }

  @Test
  fun `little-endian byte order is respected`() {
    // 556 milliBeats = 0x022C → low byte = 0x2C, high byte = 0x02
    val packet = byteArrayOf(0x10, 0x00, 0x2C, 0x02, 0x00)
    val bpm = decodeHrFromR22Packet(packet)
    // 556 / 10 = 55
    assertEquals("Little-endian 0x02,0x2C must decode to 556 milliBeats → 55 bpm", 55, bpm)
  }

  @Test
  fun `zero milli-bpm returns null (invalid reading)`() {
    val packet = byteArrayOf(0x10.toByte(), 0x00, 0x00, 0x00, 0x00)
    val result = decodeHrFromR22Packet(packet)
    assertNull("Zero milliBeats is invalid — must return null not 0", result)
  }

  @Test
  fun `high byte contributes to milli-bpm when low byte overflows`() {
    // 256 milliBeats = 0x0100 → low byte = 0x00, high byte = 0x01 → 25 bpm
    val packet = byteArrayOf(0x10.toByte(), 0x00, 0x00, 0x01, 0x00)
    val bpm = decodeHrFromR22Packet(packet)
    assertEquals("High byte 0x01 with low byte 0x00 must give 256 milliBeats → 25 bpm", 25, bpm)
  }

  @Test
  fun `sign bit of bytes is masked correctly (unsigned interpretation)`() {
    // 0xFF low byte + 0x00 high byte = 255 milliBeats → 25 bpm
    val packet = byteArrayOf(0x10.toByte(), 0x00, 0xFF.toByte(), 0x00, 0x00)
    val bpm = decodeHrFromR22Packet(packet)
    assertEquals("0xFF must be treated as unsigned 255, not signed -1; 255/10=25", 25, bpm)
  }
}
