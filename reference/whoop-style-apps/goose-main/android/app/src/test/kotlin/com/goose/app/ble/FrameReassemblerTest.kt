package com.goose.app.ble

import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for FrameReassembler — validates the iOS SYNC-09 prepend-buffer algorithm.
 *
 * Frame format under test:
 *   Byte 0: type
 *   Byte 1: bodyLen low
 *   Byte 2: bodyLen high
 *   Byte 3: sequence
 *   Bytes 4..(4+bodyLen-1): body
 *   Total = 4 + bodyLen
 */
class FrameReassemblerTest {

  private lateinit var reassembler: FrameReassembler

  @Before
  fun setUp() {
    reassembler = FrameReassembler()
  }

  // Build a well-formed frame with given type, sequence, and body bytes.
  private fun buildFrame(type: Byte, seq: Byte, body: ByteArray): ByteArray {
    val len = body.size
    return byteArrayOf(
      type,
      (len and 0xFF).toByte(),
      ((len shr 8) and 0xFF).toByte(),
      seq,
    ) + body
  }

  @Test
  fun `single complete frame in one notification returns one frame`() {
    val frame = buildFrame(0x28, 0x01, byteArrayOf(0x10, 0x50))
    val result = reassembler.feed(frame)
    assertEquals(1, result.size)
    assertArrayEquals(frame, result[0])
  }

  @Test
  fun `frame split across two notifications reassembles correctly`() {
    val body = byteArrayOf(0x10, 0x50, 0x01, 0x02)
    val frame = buildFrame(0x28, 0x01, body)

    // Split at byte 3 (mid-header)
    val firstHalf = frame.copyOfRange(0, 3)
    val secondHalf = frame.copyOfRange(3, frame.size)

    val result1 = reassembler.feed(firstHalf)
    assertEquals("First half should produce no complete frames", 0, result1.size)

    val result2 = reassembler.feed(secondHalf)
    assertEquals("Second half should complete the frame", 1, result2.size)
    assertArrayEquals(frame, result2[0])
  }

  @Test
  fun `two complete frames in one notification returns two frames`() {
    val frame1 = buildFrame(0x28, 0x01, byteArrayOf(0xAA.toByte()))
    val frame2 = buildFrame(0x2F, 0x02, byteArrayOf(0xBB.toByte(), 0xCC.toByte()))
    val combined = frame1 + frame2

    val result = reassembler.feed(combined)
    assertEquals(2, result.size)
    assertArrayEquals(frame1, result[0])
    assertArrayEquals(frame2, result[1])
  }

  @Test
  fun `oversized tail (more than 8192 bytes) is discarded not buffered`() {
    // Frame declaring 8200-byte body — but we only send the 4-byte header
    // This means the tail = 4 bytes of header (incomplete, waiting for 8200-byte body)
    // Feed just the header to create a pending-frame situation,
    // then verify that a tail > cap is discarded.
    val bigBody = ByteArray(8200) { 0xFF.toByte() }
    val bigFrame = buildFrame(0x28, 0x01, bigBody)

    // Only feed the header (4 bytes) — the 8200-byte body is "missing"
    val header = bigFrame.copyOfRange(0, 4)
    val result = reassembler.feed(header)

    // No complete frames
    assertEquals(0, result.size)

    // Buffer should hold the 4-byte header (it's <= 8192 bytes — this is normal buffering)
    assertEquals(4, reassembler.bufferSize())

    // Now simulate a scenario where the reassembled input would exceed the cap:
    // Create a partial frame that will produce a tail > 8192 bytes
    reassembler.reset()

    // Feed a complete small frame followed by a partial large frame header
    // The partial large frame header will form the tail
    val smallFrame = buildFrame(0x28, 0x01, byteArrayOf(0x01))
    // Header for a frame with 9000-byte body — body never arrives
    val largeHeader = byteArrayOf(0x28, (9000 and 0xFF).toByte(), ((9000 shr 8) and 0xFF).toByte(), 0x02)

    val combined = smallFrame + largeHeader
    val result2 = reassembler.feed(combined)

    // Small frame is extracted
    assertEquals(1, result2.size)
    assertArrayEquals(smallFrame, result2[0])

    // largeHeader (4 bytes) is a valid tail (size <= 8192) — it gets buffered
    assertEquals(4, reassembler.bufferSize())

    // Now simulate an actual >8192 tail by using a custom cap reassembler
    val smallCapReassembler = FrameReassembler(bufferCapBytes = 3)
    // Feed a partial frame header (4 bytes) — tail of 4 bytes exceeds cap of 3
    smallCapReassembler.feed(byteArrayOf(0x28, 0x05, 0x00, 0x01)) // declares 5-byte body, none arrives
    assertEquals("Tail exceeding cap should be discarded", 0, smallCapReassembler.bufferSize())
  }

  @Test
  fun `reset clears partial buffer and next feed starts fresh`() {
    val body = byteArrayOf(0x01, 0x02, 0x03)
    val frame = buildFrame(0x28, 0x01, body)

    // Feed only first half — creates a partial buffer
    reassembler.feed(frame.copyOfRange(0, 4))
    assertTrue("Buffer should be non-empty after partial feed", reassembler.bufferSize() > 0)

    // Reset
    reassembler.reset()
    assertEquals("Buffer should be empty after reset", 0, reassembler.bufferSize())

    // Feed a complete different frame — should work cleanly with no prior state
    val frame2 = buildFrame(0x2F, 0x02, byteArrayOf(0xAB.toByte()))
    val result = reassembler.feed(frame2)
    assertEquals(1, result.size)
    assertArrayEquals(frame2, result[0])
  }

  @Test
  fun `frame with zero-length body (header only) is valid`() {
    val frame = buildFrame(0x28, 0x01, ByteArray(0))
    assertEquals("Zero-body frame should be exactly 4 bytes", 4, frame.size)

    val result = reassembler.feed(frame)
    assertEquals(1, result.size)
    assertArrayEquals(frame, result[0])
  }

  @Test
  fun `three notifications produce one frame split across all three`() {
    val body = ByteArray(10) { it.toByte() }
    val frame = buildFrame(0x28, 0x01, body) // total 14 bytes

    val part1 = frame.copyOfRange(0, 5)
    val part2 = frame.copyOfRange(5, 10)
    val part3 = frame.copyOfRange(10, frame.size)

    assertEquals(0, reassembler.feed(part1).size)
    assertEquals(0, reassembler.feed(part2).size)
    val result = reassembler.feed(part3)
    assertEquals(1, result.size)
    assertArrayEquals(frame, result[0])
  }

  @Test
  fun `empty notification does not crash and returns empty list`() {
    val result = reassembler.feed(ByteArray(0))
    assertEquals(0, result.size)
  }
}
