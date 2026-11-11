import XCTest
import CoreBluetooth
@testable import GooseSwift

final class GooseBLETypesTests: XCTestCase {

  // MARK: - CoreBluetoothBLETransport.generation(from:) helper tests

  func testGenerationDerivation_gen4ServiceUUID() {
    let gen4ServiceUUID = CBUUID(string: "61080001-8d6d-82b8-614a-1c8cb0f8dcc6")
    let generation = CoreBluetoothBLETransport.generation(from: [gen4ServiceUUID])
    XCTAssertEqual(generation, "4.0", "61080001 service UUID should derive generation 4.0")
  }

  func testGenerationDerivation_gen5ServiceUUID() {
    let gen5ServiceUUID = CBUUID(string: "fd4b0001-cce1-4033-93ce-002d5875f58a")
    let generation = CoreBluetoothBLETransport.generation(from: [gen5ServiceUUID])
    XCTAssertEqual(generation, "5.0", "fd4b0001 service UUID should derive generation 5.0")
  }

  func testGenerationDerivation_unknownServiceUUID() {
    let unknownUUID = CBUUID(string: "00001800-0000-1000-8000-00805f9b34fb")
    let generation = CoreBluetoothBLETransport.generation(from: [unknownUUID])
    XCTAssertEqual(generation, "unknown", "Unknown service UUID should derive 'unknown'")
  }

  func testGenerationDerivation_emptyServiceList() {
    let generation = CoreBluetoothBLETransport.generation(from: [])
    XCTAssertEqual(generation, "unknown", "Empty service list should derive 'unknown'")
  }

  func testGenerationDerivation_gen4TakesPrecedenceWhenBothPresent() {
    let gen4UUID = CBUUID(string: "61080001-8d6d-82b8-614a-1c8cb0f8dcc6")
    let gen5UUID = CBUUID(string: "fd4b0001-cce1-4033-93ce-002d5875f58a")
    // Gen4 listed first — should return "4.0"
    let generation = CoreBluetoothBLETransport.generation(from: [gen4UUID, gen5UUID])
    XCTAssertEqual(generation, "4.0", "Gen4 UUID first in list should derive 4.0")
  }

  // MARK: - GooseNotificationEvent.rustDeviceType tests

  func testRustDeviceType_gen4CharacteristicPrefix() {
    let event = GooseNotificationEvent(
      deviceID: UUID(),
      serviceUUID: "61080001-8d6d-82b8-614a-1c8cb0f8dcc6",
      characteristicUUID: "61080003-8d6d-82b8-614a-1c8cb0f8dcc6",
      value: Data(),
      capturedAt: Date()
    )
    XCTAssertEqual(event.wireProtocol, .gen4,
      "Characteristic starting with 610800 should derive wireProtocol .gen4")
  }

  func testRustDeviceType_gen5CharacteristicPrefix() {
    let event = GooseNotificationEvent(
      deviceID: UUID(),
      serviceUUID: "fd4b0001-cce1-4033-93ce-002d5875f58a",
      characteristicUUID: "fd4b0003-cce1-4033-93ce-002d5875f58a",
      value: Data(),
      capturedAt: Date()
    )
    XCTAssertEqual(event.wireProtocol, .gen5,
      "Characteristic starting with fd4b should derive wireProtocol .gen5")
  }

  // MARK: - WearableDescriptor.genericHRMonitor tests (Phase 8 P02)

  func test_genericHRMonitor_serviceUUIDPrefix() {
    XCTAssertEqual(WearableDescriptor.genericHRMonitor.serviceUUIDPrefix, "180d",
      "genericHRMonitor must use lowercased 0x180D service UUID prefix")
  }

  func test_genericHRMonitor_commandCharacteristicPrefix_empty() {
    XCTAssertEqual(WearableDescriptor.genericHRMonitor.commandCharacteristicPrefix, "",
      "genericHRMonitor has no command characteristic — prefix must be empty")
  }

  func test_genericHRMonitor_isCommandUUID_returnsFalseForAnyUUID() {
    // Proves the empty-prefix guard (MEDIUM-1): hasPrefix("") would return true without it
    XCTAssertFalse(
      WearableDescriptor.genericHRMonitor.isCommandUUID(CBUUID(string: "2A37")),
      "isCommandUUID must return false for any UUID when commandCharacteristicPrefix is empty"
    )
    XCTAssertFalse(
      WearableDescriptor.genericHRMonitor.isCommandUUID(CBUUID(string: "FD4B0002-cce1-4033-93ce-002d5875f58a")),
      "isCommandUUID must return false for Gen5 command UUID when commandCharacteristicPrefix is empty"
    )
  }

  func test_whoopGen4_isCommandUUID_stillMatchesCommandPrefix() {
    // Sanity check: the empty-prefix guard must NOT break the populated Gen4 case
    XCTAssertTrue(
      WearableDescriptor.whoopGen4.isCommandUUID(CBUUID(string: "61080002-8d6d-82b8-614a-1c8cb0f8dcc6")),
      "whoopGen4.isCommandUUID must still return true for the 61080002 command UUID"
    )
  }

  // MARK: - GooseNotificationEvent.rustDeviceType HR_MONITOR tests (Phase 8 P02 / MEDIUM-2)

  func test_rustDeviceType_2A37_short_returnsHRMonitor() {
    let event = GooseNotificationEvent(
      deviceID: UUID(),
      serviceUUID: "180D",
      characteristicUUID: "2A37",
      value: Data(),
      capturedAt: Date()
    )
    XCTAssertEqual(event.wireProtocol, .hrMonitor,
      "Short-form characteristic UUID 2A37 must derive wireProtocol .hrMonitor")
  }

  func test_rustDeviceType_2a37_lowercase_returnsHRMonitor() {
    let event = GooseNotificationEvent(
      deviceID: UUID(),
      serviceUUID: "180d",
      characteristicUUID: "2a37",
      value: Data(),
      capturedAt: Date()
    )
    XCTAssertEqual(event.wireProtocol, .hrMonitor,
      "Lowercase short-form 2a37 must derive wireProtocol .hrMonitor")
  }

  func test_rustDeviceType_2A37_full128bit_returnsHRMonitor() {
    // Proves MEDIUM-2: full 128-bit form must match, case-insensitively
    let event = GooseNotificationEvent(
      deviceID: UUID(),
      serviceUUID: "0000180D-0000-1000-8000-00805F9B34FB",
      characteristicUUID: "00002A37-0000-1000-8000-00805F9B34FB",
      value: Data(),
      capturedAt: Date()
    )
    XCTAssertEqual(event.wireProtocol, .hrMonitor,
      "Full 128-bit form 00002A37-... must derive wireProtocol .hrMonitor")
  }

  func test_rustDeviceType_610800_stillReturnsGEN4() {
    let event = GooseNotificationEvent(
      deviceID: UUID(),
      serviceUUID: "61080001-8d6d-82b8-614a-1c8cb0f8dcc6",
      characteristicUUID: "61080003-8d6d-82b8-614a-1c8cb0f8dcc6",
      value: Data(),
      capturedAt: Date()
    )
    XCTAssertEqual(event.wireProtocol, .gen4,
      "Gen4 610800-prefixed characteristic must still derive wireProtocol .gen4")
  }

  func test_rustDeviceType_fd4b_stillReturnsGOOSE() {
    let event = GooseNotificationEvent(
      deviceID: UUID(),
      serviceUUID: "fd4b0001-cce1-4033-93ce-002d5875f58a",
      characteristicUUID: "fd4b0003-cce1-4033-93ce-002d5875f58a",
      value: Data(),
      capturedAt: Date()
    )
    XCTAssertEqual(event.wireProtocol, .gen5,
      "Gen5 fd4b-prefixed characteristic must still derive wireProtocol .gen5")
  }

  // MARK: - DeviceCapabilities.featureFlags tests (Phase 115 — FF-01 / FF-02)

  func test_deviceCapabilities_omittedFeatureFlags_defaultsToEmpty() throws {
    // Test 1: Decoding a capabilities JSON that omits feature_flags yields featureFlags == [:]
    let json = """
    {
      "wire_protocol": "gen5",
      "historical_sync": "stream",
      "battery_via_r22": true,
      "battery_via_event48": true,
      "battery_via_cmd26": true,
      "r22_realtime": true,
      "device_kind": "WHOOP5"
    }
    """.data(using: .utf8)!
    let caps = try JSONDecoder().decode(DeviceCapabilities.self, from: json)
    XCTAssertEqual(caps.featureFlags, [:],
      "Omitting feature_flags key in JSON must yield an empty featureFlags dictionary")
  }

  func test_deviceCapabilities_populatedFeatureFlags_roundTrips() throws {
    // Test 2: Decoding JSON with feature_flags present yields the expected [UInt8: UInt8] dict
    let json = """
    {
      "wire_protocol": "gen5",
      "historical_sync": "stream",
      "battery_via_r22": true,
      "battery_via_event48": true,
      "battery_via_cmd26": true,
      "r22_realtime": true,
      "device_kind": "WHOOP5",
      "feature_flags": {"0": 1, "2": 255}
    }
    """.data(using: .utf8)!
    let caps = try JSONDecoder().decode(DeviceCapabilities.self, from: json)
    XCTAssertEqual(caps.featureFlags[0], 1,
      "feature_flags key '0' with value 1 must decode to featureFlags[0] == 1")
    XCTAssertEqual(caps.featureFlags[2], 255,
      "feature_flags key '2' with value 255 must decode to featureFlags[2] == 255")
    XCTAssertEqual(caps.featureFlags.count, 2,
      "Exactly two flag pairs must be decoded")
  }

  func test_deviceCapabilities_fallbackInitialiser_hasEmptyFeatureFlags() {
    // Test 3: Fallback DeviceCapabilities initialiser (no flags) has featureFlags == [:]
    let caps = DeviceCapabilities(
      wireProtocol: .gen5,
      historicalSync: .stream,
      batteryViaR22: true,
      batteryViaEvent48: true,
      batteryViaCMD26: true,
      r22Realtime: true,
      deviceKind: "WHOOP5",
      featureFlags: [:]
    )
    XCTAssertEqual(caps.featureFlags, [:],
      "Fallback initialiser with featureFlags: [:] must have empty featureFlags")
  }
}
