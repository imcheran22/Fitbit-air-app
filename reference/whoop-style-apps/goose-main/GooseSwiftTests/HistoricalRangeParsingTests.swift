import XCTest
@testable import GooseSwift

final class HistoricalRangeParsingTests: XCTestCase {
  func testRangePageStateReportsExplicitEmptyRange() {
    let payload = commandResponsePayload(pageCurrent: 42, pageOldest: 42, pageEnd: 128)

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    XCTAssertEqual(state?.pageCurrent, 42)
    XCTAssertEqual(state?.pageOldest, 42)
    XCTAssertEqual(state?.pageEnd, 128)
    XCTAssertEqual(state?.pagesBehind, 0)
  }

  func testRangePageStateHandlesWrappedPageWindow() {
    let payload = commandResponsePayload(pageCurrent: 3, pageOldest: 98, pageEnd: 100)

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    XCTAssertEqual(state?.pagesBehind, 5)
  }

  func testRangePageStateReturnsNilForShortBody() {
    let payload: [UInt8] = [0xaa, 0x00, 34, 57, 1, 1, 2, 3]

    XCTAssertNil(GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload))
  }

  // MARK: - Ring Buffer Field Tests (SYNC-10)

  func testRingBufferFieldsParsedWhenBodyIs37BytesOrMore() {
    // 37-byte body payload: ring fields at body offsets 25/29/33
    let payload = commandResponsePayload(
      pageCurrent: 10, pageOldest: 5, pageEnd: 100,
      ringCapacity: 256, ringCurrentPage: 80, ringReadPointer: 60
    )

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    XCTAssertNotNil(state, "State must not be nil for 37-byte payload")
    XCTAssertEqual(state?.ringCapacity, 256)
    XCTAssertEqual(state?.ringCurrentPage, 80)
    XCTAssertEqual(state?.ringReadPointer, 60)
  }

  func testRingBufferFieldsNilWhenBodyShorterThan37Bytes() {
    // Standard 25-byte body (no ring fields) — ring fields must be nil
    let payload = commandResponsePayload(pageCurrent: 10, pageOldest: 5, pageEnd: 100)

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    XCTAssertNotNil(state)
    XCTAssertNil(state?.ringCapacity, "ringCapacity must be nil for short body")
    XCTAssertNil(state?.ringCurrentPage, "ringCurrentPage must be nil for short body")
    XCTAssertNil(state?.ringReadPointer, "ringReadPointer must be nil for short body")
  }

  func testRingWrappedTrueWhenCurrentPageLessThanReadPointer() {
    // ring_wrapped = currentPage < readPointer
    let payload = commandResponsePayload(
      pageCurrent: 10, pageOldest: 5, pageEnd: 100,
      ringCapacity: 256, ringCurrentPage: 20, ringReadPointer: 80
    )

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    XCTAssertTrue(state?.ringWrapped == true, "ringWrapped must be true when currentPage(20) < readPointer(80)")
  }

  func testRingWrappedFalseWhenCurrentPageGreaterThanOrEqualToReadPointer() {
    let payload = commandResponsePayload(
      pageCurrent: 10, pageOldest: 5, pageEnd: 100,
      ringCapacity: 256, ringCurrentPage: 80, ringReadPointer: 20
    )

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    XCTAssertFalse(state?.ringWrapped == true, "ringWrapped must be false when currentPage(80) >= readPointer(20)")
  }

  func testPagesBehindCorrectedWrappedCase() {
    // Wrapped: (capacity - readPointer) + currentPage = (256 - 200) + 30 = 86
    let payload = commandResponsePayload(
      pageCurrent: 10, pageOldest: 5, pageEnd: 100,
      ringCapacity: 256, ringCurrentPage: 30, ringReadPointer: 200
    )

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    XCTAssertEqual(state?.pagesBehindCorrected, 86, "Wrapped pages behind: (256-200)+30 = 86")
  }

  func testPagesBehindCorrectedNonWrappedCase() {
    // Not wrapped: currentPage - readPointer = 100 - 40 = 60
    let payload = commandResponsePayload(
      pageCurrent: 10, pageOldest: 5, pageEnd: 100,
      ringCapacity: 256, ringCurrentPage: 100, ringReadPointer: 40
    )

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    XCTAssertEqual(state?.pagesBehindCorrected, 60, "Non-wrapped pages behind: 100-40 = 60")
  }

  func testPagesBehindCorrectedNilWhenRingFieldsAbsent() {
    let payload = commandResponsePayload(pageCurrent: 10, pageOldest: 5, pageEnd: 100)

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    XCTAssertNil(state?.pagesBehindCorrected, "pagesBehindCorrected must be nil when ring fields are absent")
  }

  func testExistingPagesBehindUnchangedWhenRingFieldsPresent() {
    // Existing pagesBehind must not regress when ring fields are present
    let payload = commandResponsePayload(
      pageCurrent: 10, pageOldest: 5, pageEnd: 100,
      ringCapacity: 256, ringCurrentPage: 80, ringReadPointer: 60
    )

    let state = GooseBLEClient.historicalRangePageState(fromCommandResponsePayload: payload)

    // pagesBehind uses pageCurrent=10, pageOldest=5, pageEnd=100 (unchanged)
    XCTAssertEqual(state?.pageCurrent, 10)
    XCTAssertEqual(state?.pageOldest, 5)
    XCTAssertEqual(state?.pageEnd, 100)
    XCTAssertEqual(state?.pagesBehind, 5, "pagesBehind(10-5=5) must be unchanged by ring fields")
  }

  // MARK: - Private Helpers

  private func commandResponsePayload(
    pageCurrent: UInt32,
    pageOldest: UInt32,
    pageEnd: UInt32
  ) -> [UInt8] {
    var body = [UInt8](repeating: 0, count: 25)
    body[0] = 1
    writeUInt32LE(0, to: &body, at: 1)
    writeUInt32LE(0, to: &body, at: 5)
    writeUInt32LE(pageCurrent, to: &body, at: 9)
    writeUInt32LE(pageOldest, to: &body, at: 13)
    writeUInt32LE(0, to: &body, at: 17)
    writeUInt32LE(pageEnd, to: &body, at: 21)
    return [0xaa, 0x00, 34, 57, 1] + body
  }

  private func commandResponsePayload(
    pageCurrent: UInt32,
    pageOldest: UInt32,
    pageEnd: UInt32,
    ringCapacity: UInt32,
    ringCurrentPage: UInt32,
    ringReadPointer: UInt32
  ) -> [UInt8] {
    var body = [UInt8](repeating: 0, count: 37)
    body[0] = 1
    writeUInt32LE(0, to: &body, at: 1)
    writeUInt32LE(0, to: &body, at: 5)
    writeUInt32LE(pageCurrent, to: &body, at: 9)
    writeUInt32LE(pageOldest, to: &body, at: 13)
    writeUInt32LE(0, to: &body, at: 17)
    writeUInt32LE(pageEnd, to: &body, at: 21)
    // Ring buffer fields at body offsets 25 / 29 / 33
    writeUInt32LE(ringCapacity, to: &body, at: 25)
    writeUInt32LE(ringCurrentPage, to: &body, at: 29)
    writeUInt32LE(ringReadPointer, to: &body, at: 33)
    return [0xaa, 0x00, 34, 57, 1] + body
  }

  private func writeUInt32LE(_ value: UInt32, to bytes: inout [UInt8], at offset: Int) {
    bytes[offset] = UInt8(value & 0xff)
    bytes[offset + 1] = UInt8((value >> 8) & 0xff)
    bytes[offset + 2] = UInt8((value >> 16) & 0xff)
    bytes[offset + 3] = UInt8((value >> 24) & 0xff)
  }
}
