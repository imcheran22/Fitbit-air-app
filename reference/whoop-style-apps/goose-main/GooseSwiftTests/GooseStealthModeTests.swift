import XCTest
@testable import GooseSwift

final class GooseStealthModeTests: XCTestCase {

  // MARK: - StealthStorage key constants

  func testStealthStorage_keyFormat() {
    XCTAssertEqual(StealthStorage.recoveryScore, "goose.swift.stealth.recovery_score")
    XCTAssertEqual(StealthStorage.strainScore,   "goose.swift.stealth.strain_score")
    XCTAssertEqual(StealthStorage.hrvRmssd,      "goose.swift.stealth.hrv_rmssd")
    XCTAssertEqual(StealthStorage.restingHr,     "goose.swift.stealth.resting_hr")
    XCTAssertEqual(StealthStorage.sleepPerf,     "goose.swift.stealth.sleep_performance")
    XCTAssertEqual(StealthStorage.stressScore,   "goose.swift.stealth.stress_score")
  }

  // MARK: - GooseStealthMode.isHidden UserDefaults integration

  func testGooseStealthMode_absentKey_returnsFalse() {
    XCTAssertFalse(GooseStealthMode.isHidden(metric: "nonexistent_metric"))
  }

  func testGooseStealthMode_setKeyTrue_returnsTrue() {
    let key = StealthStorage.recoveryScore
    defer { UserDefaults.standard.removeObject(forKey: key) }
    UserDefaults.standard.set(true, forKey: key)
    XCTAssertTrue(GooseStealthMode.isHidden(metric: "recovery_score"))
  }

  func testGooseStealthMode_unknownKey_returnsFalse() {
    XCTAssertFalse(GooseStealthMode.isHidden(metric: "totally_unknown_key"))
  }

  // MARK: - StealthMask tests

  func testStealthMask_none_isHiddenReturnsFalse() {
    XCTAssertFalse(StealthMask.none.isHidden("recovery"))
  }

  func testStealthMask_hiddenSet_returnsTrue() {
    let mask = StealthMask(hidden: ["recovery", "strain"])
    XCTAssertTrue(mask.isHidden("recovery"))
    XCTAssertTrue(mask.isHidden("strain"))
    XCTAssertFalse(mask.isHidden("sleep"))
  }

  func testStealthMask_unknownMetric_returnsFalse() {
    let mask = StealthMask(hidden: ["recovery"])
    XCTAssertFalse(mask.isHidden("totally_unknown_key"))
  }
}
