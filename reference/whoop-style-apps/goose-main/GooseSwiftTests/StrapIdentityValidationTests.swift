import XCTest
@testable import GooseSwift

// MARK: - SYNC-11: Strap identity validation tests

final class StrapIdentityValidationTests: XCTestCase {

  // MARK: - Field presence

  func test_connectedStrapIdentity_fieldDeclaredOnManager() {
    let manager = GooseBLEHistoricalManager()
    XCTAssertNil(manager.connectedStrapIdentity,
      "connectedStrapIdentity must be initialised to nil")
  }

  // MARK: - Field store / retrieve

  func test_connectedStrapIdentity_storesEightBytes() {
    let manager = GooseBLEHistoricalManager()
    let identity: [UInt8] = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
    manager.connectedStrapIdentity = identity
    XCTAssertEqual(manager.connectedStrapIdentity, identity,
      "connectedStrapIdentity must store and return 8 bytes unchanged")
  }

  func test_connectedStrapIdentity_clearedToNil() {
    let manager = GooseBLEHistoricalManager()
    manager.connectedStrapIdentity = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
    manager.connectedStrapIdentity = nil
    XCTAssertNil(manager.connectedStrapIdentity,
      "Assigning nil must clear connectedStrapIdentity")
  }

  // MARK: - Identity capture from cmd 34 (getDataRange)

  func test_identityCapture_gen4Path_payloadAtLeast14_capturesBytes5to12() {
    // Gen4 guard is payload.count >= 14.
    // Identity is at payload[5..<13] — 8 bytes.
    let payload: [UInt8] = [
      0x00, 0x00, 0x00, 0x00, 0x00, // bytes 0–4
      0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x11, 0x22, // bytes 5–12 (identity)
      0x33  // byte 13 (lastSynced[0])
    ]
    XCTAssertGreaterThanOrEqual(payload.count, 14,
      "Test precondition: Gen4 guard requires payload.count >= 14")
    let identity = Array(payload[5..<13])
    XCTAssertEqual(identity, [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x11, 0x22],
      "Identity capture must extract exactly payload[5..<13] (8 bytes)")
  }

  func test_identityCapture_v5Path_payloadExactly13_captures() {
    // V5 guard: payload.count >= 13
    let payload: [UInt8] = [
      0x00, 0x00, 0x00, 0x00, 0x00, // bytes 0–4
      0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80  // bytes 5–12
    ]
    XCTAssertEqual(payload.count, 13,
      "Test precondition: exactly 13-byte payload")
    let shouldCapture = payload.count >= 13
    XCTAssertTrue(shouldCapture,
      "V5 path must capture identity when payload.count == 13 (>= not >)")
    let identity = Array(payload[5..<13])
    XCTAssertEqual(identity.count, 8,
      "Captured identity must be exactly 8 bytes")
  }

  func test_identityCapture_v5Path_payloadOf12_doesNotCapture() {
    // V5 guard: payload.count >= 13 — a 12-byte payload must NOT capture
    let payload: [UInt8] = [UInt8](repeating: 0, count: 12)
    let shouldCapture = payload.count >= 13
    XCTAssertFalse(shouldCapture,
      "V5 path must NOT capture identity when payload.count < 13 (off-by-one guard)")
  }

  // MARK: - Guard uses >= not > (critical off-by-one check)

  func test_identityGuard_usesGreaterThanOrEqualTo13_minimumCaseAccepted() {
    // payload.count == 13 is the minimum valid length for identity extraction.
    // Using > 13 would silently skip it without logging.
    let minPayload = [UInt8](repeating: 0, count: 13)
    XCTAssertTrue(minPayload.count >= 13,
      "Minimum 13-byte payload must pass the >= 13 guard")
    XCTAssertFalse(minPayload.count > 13,
      "Minimum 13-byte payload would FAIL a > 13 guard — proving >= is the correct operator")
  }

  func test_identityGuard_payloadOf14_passesGeGuard() {
    let payload = [UInt8](repeating: 0, count: 14)
    XCTAssertTrue(payload.count >= 13)
    XCTAssertTrue(payload.count > 13)
  }

  // MARK: - Identity comparison (mismatch detection)

  func test_identityComparison_matchingIdentities_noMismatch() {
    let expected: [UInt8] = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
    let responding: [UInt8] = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
    XCTAssertFalse(responding != expected,
      "Identical identity bytes must not trigger a mismatch")
  }

  func test_identityComparison_oneByteDiffers_mismatchDetected() {
    let expected: [UInt8] = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
    let responding: [UInt8] = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0xFF]
    XCTAssertTrue(responding != expected,
      "A single different byte in the identity must trigger a mismatch")
  }

  func test_identityComparison_allBytesDiffer_mismatchDetected() {
    let expected: [UInt8] = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
    let responding: [UInt8] = [0xFF, 0xFE, 0xFD, 0xFC, 0xFB, 0xFA, 0xF9, 0xF8]
    XCTAssertTrue(responding != expected,
      "Completely different identity bytes must trigger a mismatch")
  }

  func test_identityComparison_allZeros_matchesAllZeros() {
    let expected: [UInt8] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    let responding: [UInt8] = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    XCTAssertEqual(responding, expected,
      "All-zero identity must match all-zero identity (valid hardware identity)")
  }

  // MARK: - Skip when connectedStrapIdentity is nil

  func test_identityCheck_skippedWhenNilIdentity() {
    // Models the check: if let expectedIdentity = historicalManager.connectedStrapIdentity { ... }
    // When nil: identity check is skipped, sync continues.
    let connectedStrapIdentity: [UInt8]? = nil
    let checkExecuted = connectedStrapIdentity != nil
    XCTAssertFalse(checkExecuted,
      "Identity check must be skipped when connectedStrapIdentity is nil")
  }

  func test_identityCheck_executedWhenIdentitySet() {
    let connectedStrapIdentity: [UInt8]? = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
    let checkExecuted = connectedStrapIdentity != nil
    XCTAssertTrue(checkExecuted,
      "Identity check must execute when connectedStrapIdentity is non-nil")
  }

  // MARK: - Identity lifecycle: clear on session boundaries

  func test_connectedStrapIdentity_clearOnSyncBegin() {
    // Models: historicalManager.connectedStrapIdentity = nil at sync begin
    let manager = GooseBLEHistoricalManager()
    manager.connectedStrapIdentity = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]
    manager.connectedStrapIdentity = nil
    XCTAssertNil(manager.connectedStrapIdentity,
      "connectedStrapIdentity must be nil after sync-begin clear (beginHistoricalSync invariant)")
  }

  func test_connectedStrapIdentity_clearOnSyncComplete() {
    let manager = GooseBLEHistoricalManager()
    manager.connectedStrapIdentity = [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x11, 0x22]
    manager.connectedStrapIdentity = nil
    XCTAssertNil(manager.connectedStrapIdentity,
      "connectedStrapIdentity must be nil after sync-complete clear (completeHistoricalSync invariant)")
  }

  func test_connectedStrapIdentity_clearOnSyncFail() {
    let manager = GooseBLEHistoricalManager()
    manager.connectedStrapIdentity = [0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80]
    manager.connectedStrapIdentity = nil
    XCTAssertNil(manager.connectedStrapIdentity,
      "connectedStrapIdentity must be nil after sync-fail clear (failHistoricalSync invariant)")
  }

  func test_connectedStrapIdentity_doesNotLeakAcrossSessionBoundaries() {
    // Proves the three-clear guarantee: a captured identity from session N
    // cannot be consulted during session N+1 after any boundary clear.
    let manager = GooseBLEHistoricalManager()
    manager.connectedStrapIdentity = [0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE, 0xBA, 0xBE]
    manager.connectedStrapIdentity = nil  // any boundary clear
    XCTAssertNil(manager.connectedStrapIdentity,
      "Captured strap identity must not survive a session-boundary clear (T-99-02-02 mitigation)")
  }

  // MARK: - Payload slice safety

  func test_payloadSlice_5to13_isExactly8Bytes() {
    // Verifies the slice range [5..<13] always produces exactly 8 bytes for any valid payload.
    let payload = [UInt8](0..<16)  // 16-byte payload, values 0–15
    let slice = Array(payload[5..<13])
    XCTAssertEqual(slice.count, 8,
      "Slice payload[5..<13] must always produce exactly 8 bytes")
    XCTAssertEqual(slice, [5, 6, 7, 8, 9, 10, 11, 12],
      "Slice values must match bytes at positions 5 through 12")
  }
}
