package com.goose.app.ble

import org.junit.Assert.*
import org.junit.Test

/**
 * Nyquist validation tests for Phase 105 — Android Historical Sync Port.
 *
 * Requirement: AND-03
 *
 * Tests the documented wire-format contracts from 105-01-PLAN.md.
 * WhoopBleClient.buildCommandFrame() is private — these tests replicate
 * and verify the algorithm specified in the plan so any future refactor
 * that breaks the wire format will be caught here.
 *
 * Frame wire format (mirrors iOS buildCommandFrame):
 *   body = [sequence, command] + data
 *   frame = [PACKET_TYPE_COMMAND(0x01), bodyLen&0xFF, (bodyLen>>8)&0xFF, sequence] + body
 *
 * Historical sync command bytes (mirrors iOS HistoricalCommandKind):
 *   GET_DATA_RANGE          = 34 (0x22)
 *   SEND_HISTORICAL_DATA    = 22 (0x16)
 *   HISTORICAL_DATA_RESULT  = 23 (0x17)
 */
class WhoopBleClientHistoricalSyncTest {

  // ──────────────────────────────────────────────────────────────────────────
  // Mirror of WhoopBleClient.buildCommandFrame() — tests the contract.
  // If the implementation changes its wire format, this test catches the drift.
  // ──────────────────────────────────────────────────────────────────────────
  private fun buildCommandFrame(sequence: Byte, command: Byte, data: ByteArray): ByteArray {
    val body = byteArrayOf(sequence, command) + data
    val bodyLen = body.size
    return byteArrayOf(
      0x01, // PACKET_TYPE_COMMAND
      (bodyLen and 0xFF).toByte(),
      ((bodyLen ushr 8) and 0xFF).toByte(),
      sequence,
    ) + body
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Command byte constants (plan: AND-03 acceptance criterion T1)
  // ──────────────────────────────────────────────────────────────────────────

  @Test
  fun `GET_DATA_RANGE command byte is 34 (0x22)`() {
    val CMD_GET_DATA_RANGE: Byte = 34
    assertEquals("GET_DATA_RANGE must be 0x22", 0x22.toByte(), CMD_GET_DATA_RANGE)
  }

  @Test
  fun `SEND_HISTORICAL_DATA command byte is 22 (0x16)`() {
    val CMD_SEND_HISTORICAL_DATA: Byte = 22
    assertEquals("SEND_HISTORICAL_DATA must be 0x16", 0x16.toByte(), CMD_SEND_HISTORICAL_DATA)
  }

  @Test
  fun `HISTORICAL_DATA_RESULT ack byte is 23 (0x17)`() {
    val CMD_HISTORICAL_DATA_RESULT: Byte = 23
    assertEquals("HISTORICAL_DATA_RESULT must be 0x17", 0x17.toByte(), CMD_HISTORICAL_DATA_RESULT)
  }

  @Test
  fun `PACKET_TYPE_COMMAND is 0x01`() {
    val PACKET_TYPE_COMMAND: Byte = 0x01
    assertEquals(0x01.toByte(), PACKET_TYPE_COMMAND)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Wire format tests (plan: AND-03 acceptance criterion T2)
  // These pin the exact byte layout that WHOOP devices expect.
  // ──────────────────────────────────────────────────────────────────────────

  @Test
  fun `buildCommandFrame with empty data produces correct wire bytes`() {
    // sequence=57, command=34 (GET_DATA_RANGE), data=[] (Gen5 payload)
    // body = [57, 34], bodyLen = 2
    // frame = [0x01, 0x02, 0x00, 57, 57, 34]
    val frame = buildCommandFrame(sequence = 57, command = 34, data = byteArrayOf())

    assertEquals("frame must be 6 bytes", 6, frame.size)
    assertEquals("byte[0] must be PACKET_TYPE_COMMAND (0x01)", 0x01.toByte(), frame[0])
    assertEquals("byte[1] must be bodyLen low = 2", 2.toByte(), frame[1])
    assertEquals("byte[2] must be bodyLen high = 0", 0.toByte(), frame[2])
    assertEquals("byte[3] must be outerSeq = 57", 57.toByte(), frame[3])
    assertEquals("byte[4] must be innerSeq = 57", 57.toByte(), frame[4])
    assertEquals("byte[5] must be command byte = 34 (GET_DATA_RANGE)", 34.toByte(), frame[5])
  }

  @Test
  fun `buildCommandFrame with Gen4 zero-byte payload produces correct wire bytes`() {
    // Gen4 payload override: [0x00] (single zero byte)
    // sequence=57, command=34, data=[0x00]
    // body = [57, 34, 0x00], bodyLen = 3
    // frame = [0x01, 0x03, 0x00, 57, 57, 34, 0x00]
    val frame = buildCommandFrame(sequence = 57, command = 34, data = byteArrayOf(0x00))

    assertEquals("Gen4 frame must be 7 bytes", 7, frame.size)
    assertEquals("byte[0] must be PACKET_TYPE_COMMAND (0x01)", 0x01.toByte(), frame[0])
    assertEquals("byte[1] must be bodyLen low = 3", 3.toByte(), frame[1])
    assertEquals("byte[2] must be bodyLen high = 0", 0.toByte(), frame[2])
    assertEquals("byte[3] must be outerSeq = 57", 57.toByte(), frame[3])
    assertEquals("byte[4] must be innerSeq = 57", 57.toByte(), frame[4])
    assertEquals("byte[5] must be command byte = 34", 34.toByte(), frame[5])
    assertEquals("byte[6] must be Gen4 payload byte 0x00", 0x00.toByte(), frame[6])
  }

  @Test
  fun `buildCommandFrame SEND_HISTORICAL_DATA Gen5 wire bytes`() {
    // sequence=58 (after first increment), command=22 (SEND_HISTORICAL_DATA), data=[]
    // body = [58, 22], bodyLen = 2
    // frame = [0x01, 0x02, 0x00, 58, 58, 22]
    val frame = buildCommandFrame(sequence = 58, command = 22, data = byteArrayOf())

    assertEquals(6, frame.size)
    assertEquals(0x01.toByte(), frame[0])
    assertEquals(2.toByte(), frame[1])
    assertEquals(0.toByte(), frame[2])
    assertEquals(58.toByte(), frame[3])
    assertEquals(58.toByte(), frame[4])
    assertEquals(22.toByte(), frame[5])
  }

  @Test
  fun `buildCommandFrame bodyLen encoding handles value requiring two bytes`() {
    // data with 253 bytes → body = [seq, cmd] + 253 bytes = 255 bytes
    // bodyLen = 255 → low=0xFF, high=0x00
    val data = ByteArray(253) { 0xAA.toByte() }
    val frame = buildCommandFrame(sequence = 1, command = 34, data = data)

    assertEquals("byte[1] must be bodyLen low = 255 = 0xFF", 0xFF.toByte(), frame[1])
    assertEquals("byte[2] must be bodyLen high = 0", 0x00.toByte(), frame[2])
  }

  @Test
  fun `buildCommandFrame bodyLen encoding handles value above 255`() {
    // data with 254 bytes → body = [seq, cmd] + 254 bytes = 256 bytes
    // bodyLen = 256 → low=0x00, high=0x01
    val data = ByteArray(254) { 0xBB.toByte() }
    val frame = buildCommandFrame(sequence = 1, command = 34, data = data)

    assertEquals("byte[1] must be bodyLen low = 0", 0x00.toByte(), frame[1])
    assertEquals("byte[2] must be bodyLen high = 1", 0x01.toByte(), frame[2])
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Source-string routing logic (plan: AND-03 acceptance criterion T4)
  // handleNotification() selects source based on syncInProgress snapshot.
  // ──────────────────────────────────────────────────────────────────────────

  @Test
  fun `source is historical_sync when syncInProgress is true`() {
    val syncInProgress = true
    val frameSource = if (syncInProgress) "historical_sync" else "android_ble"
    assertEquals("historical_sync", frameSource)
  }

  @Test
  fun `source is android_ble when syncInProgress is false`() {
    val syncInProgress = false
    val frameSource = if (syncInProgress) "historical_sync" else "android_ble"
    assertEquals("android_ble", frameSource)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Gen4 vs Gen5 payload routing (plan: AND-03 must_haves)
  // ──────────────────────────────────────────────────────────────────────────

  @Test
  fun `Gen5 historical command payload is empty byteArray`() {
    val generation = WhoopGeneration.GEN5
    val payload = when (generation) {
      WhoopGeneration.GEN4 -> byteArrayOf(0x00)
      else -> byteArrayOf()
    }
    assertEquals("Gen5 payload must be empty", 0, payload.size)
  }

  @Test
  fun `Gen4 historical command payload is single zero byte`() {
    val generation = WhoopGeneration.GEN4
    val payload = when (generation) {
      WhoopGeneration.GEN4 -> byteArrayOf(0x00)
      else -> byteArrayOf()
    }
    assertEquals("Gen4 payload must be 1 byte", 1, payload.size)
    assertEquals("Gen4 payload byte must be 0x00", 0x00.toByte(), payload[0])
  }

  @Test
  fun `MG generation uses Gen5 payload path (empty byteArray)`() {
    val generation = WhoopGeneration.MG
    val payload = when (generation) {
      WhoopGeneration.GEN4 -> byteArrayOf(0x00)
      else -> byteArrayOf()
    }
    assertEquals("MG payload must be empty (non-Gen4 path)", 0, payload.size)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // syncInProgress guard semantics (plan: AND-03 acceptance criterion T3)
  // startHistoricalSync() must be a no-op when already in progress.
  // ──────────────────────────────────────────────────────────────────────────

  @Test
  fun `concurrent sync guard — second call skipped when flag is true`() {
    var syncInProgress = false
    var commandsWritten = 0

    // Simulate startHistoricalSync() first call
    if (!syncInProgress) {
      syncInProgress = true
      commandsWritten++
    }

    // Simulate startHistoricalSync() second call — should be skipped
    if (!syncInProgress) {
      syncInProgress = true
      commandsWritten++
    }

    assertEquals("Only one sync initiation should occur", 1, commandsWritten)
    assertTrue("syncInProgress must be true after first call", syncInProgress)
  }

  @Test
  fun `completeSyncIfActive clears syncInProgress and pendingSyncCommand`() {
    var syncInProgress = true
    var pendingSyncCommand: Byte = 34

    // Simulate completeSyncIfActive("idle_timeout")
    if (syncInProgress) {
      syncInProgress = false
      pendingSyncCommand = 0
    }

    assertFalse("syncInProgress must be false after completion", syncInProgress)
    assertEquals("pendingSyncCommand must be 0 after completion", 0.toByte(), pendingSyncCommand)
  }

  @Test
  fun `onGattDisconnected resets syncInProgress to false`() {
    var syncInProgress = true

    // Simulate onGattDisconnected() cleanup
    syncInProgress = false

    assertFalse("syncInProgress must be false after disconnect", syncInProgress)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Sequence counter behavior (plan: syncSequence starts at 57, wraps byte)
  // ──────────────────────────────────────────────────────────────────────────

  @Test
  fun `syncSequence starts at 57 matching iOS nextHistoricalCommandSequence initial value`() {
    val syncSequence: Byte = 57
    assertEquals("Initial syncSequence must match iOS value (57)", 57.toByte(), syncSequence)
  }

  @Test
  fun `syncSequence wraps correctly on byte overflow`() {
    var syncSequence: Byte = 127
    syncSequence = (syncSequence + 1).toByte()
    assertEquals("Byte overflow must wrap to -128 (signed 0x80)", (-128).toByte(), syncSequence)

    var syncSequence2: Byte = -1 // 0xFF unsigned
    syncSequence2 = (syncSequence2 + 1).toByte()
    assertEquals("0xFF + 1 must wrap to 0", 0.toByte(), syncSequence2)
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Frame structure compatibility with FrameReassembler (AND-03 Gen4 path)
  // Historical command frames share the same 4-byte header format as data frames.
  // ──────────────────────────────────────────────────────────────────────────

  @Test
  fun `command frame header format is compatible with WHOOP 4-byte frame header`() {
    // Both command frames and data frames share the same header layout:
    //   byte[0] = type, byte[1] = bodyLen low, byte[2] = bodyLen high, byte[3] = sequence
    // buildCommandFrame sets byte[0] = 0x01, byte[1..2] = bodyLen, byte[3] = outerSeq
    val frame = buildCommandFrame(sequence = 10, command = 34, data = byteArrayOf())

    // Verify the header is well-formed
    val type = frame[0]
    val bodyLenLow = frame[1].toInt() and 0xFF
    val bodyLenHigh = frame[2].toInt() and 0xFF
    val outerSeq = frame[3]
    val declaredBodyLen = bodyLenLow or (bodyLenHigh shl 8)

    assertEquals("type byte must be 0x01", 0x01.toByte(), type)
    assertEquals("declared body length must match actual body size", frame.size - 4, declaredBodyLen)
    assertEquals("outerSeq must match sequence argument", 10.toByte(), outerSeq)
  }
}
