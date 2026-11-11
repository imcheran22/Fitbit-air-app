import XCTest
@testable import GooseSwift

// MARK: - Helpers

private func makeCapabilities(
  wireProtocol: String,
  historicalSync: String,
  deviceKind: String,
  batteryViaR22: Bool = false,
  batteryViaEvent48: Bool = false,
  batteryViaCMD26: Bool = false,
  r22Realtime: Bool = false
) -> DeviceCapabilities {
  let json = """
  {
    "wire_protocol": "\(wireProtocol)",
    "historical_sync": "\(historicalSync)",
    "device_kind": "\(deviceKind)",
    "battery_via_r22": \(batteryViaR22),
    "battery_via_event48": \(batteryViaEvent48),
    "battery_via_cmd26": \(batteryViaCMD26),
    "r22_realtime": \(r22Realtime)
  }
  """
  return try! JSONDecoder().decode(DeviceCapabilities.self, from: Data(json.utf8))
}

// MARK: - DeviceCatalog Tests (Phase 109 / MG-03)

final class DeviceCatalogTests: XCTestCase {

  // MARK: generationLabel — MG-03 core fix

  func test_generationLabel_whoopMG_returnsMg() {
    let caps = makeCapabilities(wireProtocol: "gen5", historicalSync: "stream", deviceKind: "WHOOP_MG")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertEqual(catalog.generationLabel, "mg",
      "WHOOP_MG with gen5 wire protocol must return 'mg' from generationLabel (MG-03 fix)")
  }

  func test_generationLabel_gen4_returnsGen4() {
    let caps = makeCapabilities(wireProtocol: "gen4", historicalSync: "page_sequence", deviceKind: "WHOOP4")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertEqual(catalog.generationLabel, "gen4",
      "gen4 wire protocol must return 'gen4' (no regression)")
  }

  func test_generationLabel_gen5_returnsGen5() {
    let caps = makeCapabilities(wireProtocol: "gen5", historicalSync: "stream", deviceKind: "WHOOP5")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertEqual(catalog.generationLabel, "gen5",
      "WHOOP5 gen5 wire protocol must return 'gen5' (no regression)")
  }

  func test_generationLabel_nilCapabilities_returnsUnknown() {
    let catalog = DeviceCatalog(capabilities: nil)
    XCTAssertEqual(catalog.generationLabel, "unknown",
      "nil capabilities must return 'unknown' from generationLabel")
  }

  // MARK: historicalDeviceType — MG-03 core fix

  func test_historicalDeviceType_whoopMG_returnsWhoopMG() {
    let caps = makeCapabilities(wireProtocol: "gen5", historicalSync: "stream", deviceKind: "WHOOP_MG")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertEqual(catalog.historicalDeviceType, "WHOOP_MG",
      "WHOOP_MG must return 'WHOOP_MG' from historicalDeviceType (MG-03 fix; was 'GOOSE' before)")
  }

  func test_historicalDeviceType_gen4_returnsGEN4() {
    let caps = makeCapabilities(wireProtocol: "gen4", historicalSync: "page_sequence", deviceKind: "WHOOP4")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertEqual(catalog.historicalDeviceType, "GEN4",
      "Gen4 page-sequence device must return 'GEN4' (no regression)")
  }

  func test_historicalDeviceType_gen5_returnsGOOSE() {
    let caps = makeCapabilities(wireProtocol: "gen5", historicalSync: "stream", deviceKind: "WHOOP5")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertEqual(catalog.historicalDeviceType, "GOOSE",
      "WHOOP5 gen5 stream must return 'GOOSE' (bridgeString, no regression)")
  }

  // MARK: displayGeneration — no-regression (must remain "MG" for WHOOP_MG)

  func test_displayGeneration_whoopMG_returnsMG() {
    let caps = makeCapabilities(wireProtocol: "gen5", historicalSync: "stream", deviceKind: "WHOOP_MG")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertEqual(catalog.displayGeneration, "MG",
      "displayGeneration must still return 'MG' for WHOOP_MG — no regression from phase 109")
  }

  func test_displayGeneration_gen4_returns4dot0() {
    let caps = makeCapabilities(wireProtocol: "gen4", historicalSync: "page_sequence", deviceKind: "WHOOP4")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertEqual(catalog.displayGeneration, "4.0",
      "displayGeneration must return '4.0' for gen4 (no regression)")
  }

  func test_displayGeneration_gen5_returns5dot0() {
    let caps = makeCapabilities(wireProtocol: "gen5", historicalSync: "stream", deviceKind: "WHOOP5")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertEqual(catalog.displayGeneration, "5.0",
      "displayGeneration must return '5.0' for WHOOP5 (no regression)")
  }

  // MARK: usesPageSequenceSync — no-regression (must be false for MG)

  func test_usesPageSequenceSync_whoopMG_returnsFalse() {
    let caps = makeCapabilities(wireProtocol: "gen5", historicalSync: "stream", deviceKind: "WHOOP_MG")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertFalse(catalog.usesPageSequenceSync,
      "WHOOP_MG uses stream historical sync — usesPageSequenceSync must be false (no regression)")
  }

  func test_usesPageSequenceSync_gen4_returnsTrue() {
    let caps = makeCapabilities(wireProtocol: "gen4", historicalSync: "page_sequence", deviceKind: "WHOOP4")
    let catalog = DeviceCatalog(capabilities: caps)
    XCTAssertTrue(catalog.usesPageSequenceSync,
      "Gen4 page-sequence device must have usesPageSequenceSync = true (no regression)")
  }
}
