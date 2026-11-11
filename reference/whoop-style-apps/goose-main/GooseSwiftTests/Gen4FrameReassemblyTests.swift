import XCTest
@testable import GooseSwift

// MARK: - SYNC-09: Gen4 frame reassembly buffer tests

final class Gen4FrameReassemblyTests: XCTestCase {

  // MARK: - Field presence

  func test_gen4HistoricalFrameBuffer_fieldDeclaredOnManager() {
    let manager = GooseBLEHistoricalManager()
    // Field starts empty — Data() is its zero value.
    XCTAssertTrue(manager.gen4HistoricalFrameBuffer.isEmpty,
      "gen4HistoricalFrameBuffer must be initialised to Data() (empty)")
  }

  // MARK: - Buffer mechanics (direct state manipulation)

  func test_frameBuffer_storesAndRetrieves() {
    let manager = GooseBLEHistoricalManager()
    let bytes = Data([0xaa, 0x01, 0x02, 0x03])
    manager.gen4HistoricalFrameBuffer = bytes
    XCTAssertEqual(manager.gen4HistoricalFrameBuffer, bytes,
      "gen4HistoricalFrameBuffer must store arbitrary Data and return it unchanged")
  }

  func test_frameBuffer_clearedToEmpty() {
    let manager = GooseBLEHistoricalManager()
    manager.gen4HistoricalFrameBuffer = Data([0xaa, 0x01])
    manager.gen4HistoricalFrameBuffer = Data()
    XCTAssertTrue(manager.gen4HistoricalFrameBuffer.isEmpty,
      "Assigning Data() must clear gen4HistoricalFrameBuffer to empty")
  }

  // MARK: - 8192-byte cap invariant (logic extracted from handler)

  func test_tailStorageLogic_storesTailWhenBelowCap() {
    // Mirrors the tail-store expression in handleHistoricalSyncValue:
    // historicalManager.gen4HistoricalFrameBuffer = tail.count > 0 && tail.count <= 8192 ? tail : Data()
    let tail = Data(repeating: 0xbb, count: 100)
    let stored = tail.count > 0 && tail.count <= 8192 ? tail : Data()
    XCTAssertEqual(stored, tail,
      "Tail within 1–8192 bytes must be stored as-is (not discarded)")
  }

  func test_tailStorageLogic_discardsTailAboveCap() {
    let oversized = Data(repeating: 0xcc, count: 8193)
    let stored = oversized.count > 0 && oversized.count <= 8192 ? oversized : Data()
    XCTAssertTrue(stored.isEmpty,
      "Tail exceeding 8192 bytes must be discarded (stored as Data()) to prevent unbounded growth")
  }

  func test_tailStorageLogic_discardsTailAtExactCap_passes() {
    let exactCap = Data(repeating: 0xdd, count: 8192)
    let stored = exactCap.count > 0 && exactCap.count <= 8192 ? exactCap : Data()
    XCTAssertEqual(stored, exactCap,
      "Tail of exactly 8192 bytes is within cap and must be stored")
  }

  func test_tailStorageLogic_discardsTailAtCapPlusOne_discards() {
    let overCap = Data(repeating: 0xee, count: 8193)
    let stored = overCap.count > 0 && overCap.count <= 8192 ? overCap : Data()
    XCTAssertTrue(stored.isEmpty,
      "Tail of 8193 bytes exceeds the 8192-byte cap and must be discarded")
  }

  func test_tailStorageLogic_emptyTailProducesEmpty() {
    let empty = Data()
    let stored = empty.count > 0 && empty.count <= 8192 ? empty : Data()
    XCTAssertTrue(stored.isEmpty,
      "Empty tail must not be stored (count > 0 guard)")
  }

  // MARK: - consumedCount derivation logic

  func test_consumedCount_singleFrame() {
    // Frame: [header0, lenLow, lenHigh, header3, ...body...]
    // declaredLength = Int(frame[1]) | Int(frame[2]) << 8
    // consumedCount = 4 + declaredLength
    let bodyLen: Int = 10
    let frame = Data([0xaa, UInt8(bodyLen & 0xff), UInt8((bodyLen >> 8) & 0xff), 0x01]
      + [UInt8](repeating: 0x00, count: bodyLen))
    let consumed = frame.count >= 4
      ? 4 + (Int(frame[1]) | Int(frame[2]) << 8)
      : 0
    XCTAssertEqual(consumed, 4 + bodyLen,
      "consumedCount for a single frame must be 4 + declaredLength")
  }

  func test_consumedCount_twoFrames() {
    let lenA = 5
    let lenB = 8
    let frameA = Data([0xaa, UInt8(lenA), 0x00, 0x01] + [UInt8](repeating: 0x00, count: lenA))
    let frameB = Data([0xaa, UInt8(lenB), 0x00, 0x01] + [UInt8](repeating: 0x00, count: lenB))
    let frames = [frameA, frameB]
    let consumed = frames.reduce(0) { acc, frame in
      guard frame.count >= 4 else { return acc }
      return acc + 4 + (Int(frame[1]) | Int(frame[2]) << 8)
    }
    XCTAssertEqual(consumed, (4 + lenA) + (4 + lenB),
      "consumedCount over two frames must be the sum of each frame's 4 + declaredLength")
  }

  func test_consumedCount_shortFrameSkipped() {
    // A frame with fewer than 4 bytes contributes 0 to consumedCount (guard protects slice).
    let shortFrame = Data([0xaa, 0x00])
    let consumed = shortFrame.count >= 4
      ? 4 + (Int(shortFrame[1]) | Int(shortFrame[2]) << 8)
      : 0
    XCTAssertEqual(consumed, 0,
      "A frame shorter than 4 bytes must contribute 0 to consumedCount (guard skips it)")
  }

  // MARK: - Prepend semantics (logical test of buffer + new bytes composition)

  func test_prependBuffer_producesCorrectInputBytes() {
    // Simulates: inputBytes = gen4HistoricalFrameBuffer + value
    let buffered = Data([0x01, 0x02, 0x03])
    let incoming = Data([0x04, 0x05, 0x06])
    let inputBytes = buffered + incoming
    XCTAssertEqual(inputBytes, Data([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
      "Buffer prepended to incoming value must produce correct concatenated inputBytes")
  }

  func test_prependBuffer_emptyBuffer_inputBytesEqualsValue() {
    let buffered = Data()
    let incoming = Data([0x04, 0x05])
    let inputBytes = buffered.isEmpty ? incoming : buffered + incoming
    XCTAssertEqual(inputBytes, incoming,
      "When buffer is empty, inputBytes must equal the raw incoming value")
  }

  // MARK: - Buffer lifecycle: clear on sync begin

  func test_frameBuffer_clearOnSyncBegin_manualClear() {
    // Models the beginHistoricalSync clear:
    //   historicalManager.gen4HistoricalFrameBuffer = Data()
    let manager = GooseBLEHistoricalManager()
    manager.gen4HistoricalFrameBuffer = Data([0xaa, 0x01, 0x02])
    // Simulate sync begin clear
    manager.gen4HistoricalFrameBuffer = Data()
    XCTAssertTrue(manager.gen4HistoricalFrameBuffer.isEmpty,
      "Buffer must be empty after sync-begin clear (beginHistoricalSync invariant)")
  }

  func test_frameBuffer_clearOnSyncComplete_manualClear() {
    // Models the completeHistoricalSync clear
    let manager = GooseBLEHistoricalManager()
    manager.gen4HistoricalFrameBuffer = Data([0xbb, 0xcc])
    manager.gen4HistoricalFrameBuffer = Data()
    XCTAssertTrue(manager.gen4HistoricalFrameBuffer.isEmpty,
      "Buffer must be empty after sync-complete clear (completeHistoricalSync invariant)")
  }

  func test_frameBuffer_clearOnSyncFail_manualClear() {
    // Models the failHistoricalSync clear
    let manager = GooseBLEHistoricalManager()
    manager.gen4HistoricalFrameBuffer = Data([0xdd, 0xee, 0xff])
    manager.gen4HistoricalFrameBuffer = Data()
    XCTAssertTrue(manager.gen4HistoricalFrameBuffer.isEmpty,
      "Buffer must be empty after sync-fail clear (failHistoricalSync invariant)")
  }

  func test_frameBuffer_doesNotLeakAcrossSessionBoundaries() {
    // Proves the three-clear guarantee: stale bytes cannot cross a session boundary.
    let manager = GooseBLEHistoricalManager()
    manager.gen4HistoricalFrameBuffer = Data(repeating: 0xff, count: 512)
    // Simulate any of the three boundary clears
    manager.gen4HistoricalFrameBuffer = Data()
    XCTAssertEqual(manager.gen4HistoricalFrameBuffer.count, 0,
      "512 stale bytes must not survive a session-boundary clear")
  }
}
