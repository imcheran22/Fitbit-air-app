package com.goose.app.ble

/**
 * Gen4 multi-notification BLE frame reassembler.
 *
 * Mirrors the iOS SYNC-09 prepend-buffer algorithm in
 * CoreBluetoothBLETransport+HistoricalHandlers.swift (handleHistoricalSyncValue):
 *
 *   1. Prepend any previously buffered tail bytes to incoming notification bytes.
 *   2. Parse as many complete frames as possible from the combined buffer.
 *   3. Store unconsumed tail bytes back into the buffer (capped at bufferCapBytes
 *      to prevent unbounded growth from malformed frames — threat T-104-01).
 *   4. Return the list of complete frame byte arrays.
 *
 * Frame wire format (same as iOS parseFrames / frames(in:)):
 *   Byte 0: packet type
 *   Byte 1: body length low byte (little-endian)
 *   Byte 2: body length high byte (little-endian)
 *   Byte 3: sequence number
 *   Bytes 4..(4+bodyLen-1): body
 *   Total frame size = 4 + bodyLen
 *
 * Gen5 devices use single-notification frames — callers should pass Gen5 bytes
 * directly to the bridge without going through this class.
 */
class FrameReassembler(private val bufferCapBytes: Int = 8192) {

  private var buffer: ByteArray = ByteArray(0)

  /**
   * Feed new BLE notification bytes; returns zero or more complete frames.
   * Thread safety: not synchronized — callers must ensure single-threaded access.
   */
  fun feed(incoming: ByteArray): List<ByteArray> {
    // Step 1: prepend stored tail to incoming bytes
    val input: ByteArray = if (buffer.isEmpty()) {
      incoming
    } else {
      buffer + incoming
    }

    // Step 2: reset buffer before parsing (will be re-set from tail if needed)
    buffer = ByteArray(0)

    // Step 3: extract complete frames
    val frames = mutableListOf<ByteArray>()
    var offset = 0

    while (offset + 4 <= input.size) {
      // Header: bytes [offset+1] and [offset+2] are body length (little-endian)
      val bodyLen = (input[offset + 1].toInt() and 0xFF) or
        ((input[offset + 2].toInt() and 0xFF) shl 8)
      val frameSize = 4 + bodyLen

      if (offset + frameSize > input.size) {
        // Incomplete frame — stop and save tail
        break
      }

      frames.add(input.copyOfRange(offset, offset + frameSize))
      offset += frameSize
    }

    // Step 4: store unconsumed tail (cap at bufferCapBytes)
    if (offset < input.size) {
      val tail = input.copyOfRange(offset, input.size)
      buffer = if (tail.size <= bufferCapBytes) tail else ByteArray(0)
    }

    return frames
  }

  /**
   * Reset the reassembly buffer. Call on disconnect or reconnect to avoid
   * cross-connection frame contamination.
   */
  fun reset() {
    buffer = ByteArray(0)
  }

  /** Exposed for testing — current buffer size. */
  internal fun bufferSize(): Int = buffer.size
}
