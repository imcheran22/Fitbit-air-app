import CoreBluetooth
import Foundation
import OSLog

// MARK: - WearableDescriptor

struct WearableDescriptor {
  let serviceUUIDPrefix: String
  let commandCharacteristicPrefix: String

  func isCommandCharacteristic(_ c: CBCharacteristic) -> Bool {
    guard !commandCharacteristicPrefix.isEmpty else { return false }
    return c.uuid.uuidString.lowercased().hasPrefix(commandCharacteristicPrefix)
  }

  func isCommandUUID(_ uuid: CBUUID) -> Bool {
    guard !commandCharacteristicPrefix.isEmpty else { return false }
    return uuid.uuidString.lowercased().hasPrefix(commandCharacteristicPrefix)
  }
}

extension WearableDescriptor {
  // Gen5 service UUID prefix fd4b0001-, command UUID prefix fd4b0002-
  static let whoopGen5 = WearableDescriptor(
    serviceUUIDPrefix: "fd4b0001",
    commandCharacteristicPrefix: "fd4b0002"
  )

  // Gen4 service UUID prefix 61080001-, command UUID prefix 61080002-
  static let whoopGen4 = WearableDescriptor(
    serviceUUIDPrefix: "61080001",
    commandCharacteristicPrefix: "61080002"
  )

  // Standard Bluetooth Heart Rate Service 0x180D / HR Measurement 0x2A37
  // HR monitors are read-only notify devices with no command characteristic
  static let genericHRMonitor = WearableDescriptor(
    serviceUUIDPrefix: "180d",
    commandCharacteristicPrefix: ""
  )
}

// MARK: -

enum GooseLogLevel: String {
  case debug
  case info
  case warn
  case error
}

struct GooseDiscoveredDevice: Identifiable, Equatable {
  let id: UUID
  let name: String
  let rssi: Int
  let generation: String
}

struct GooseMessage: Identifiable {
  let id = UUID()
  let timestamp: Date
  let level: GooseLogLevel
  let source: String
  let title: String
  let body: String
}

struct GooseNotificationEvent {
  let deviceID: UUID
  let serviceUUID: String
  let characteristicUUID: String
  let value: Data
  let capturedAt: Date

  var wireProtocol: WireProtocol {
    if characteristicUUID.lowercased().hasPrefix("610800") {
      return .gen4
    }
    let normalizedUUID = characteristicUUID.replacingOccurrences(of: "-", with: "").lowercased()
    if normalizedUUID == "2a37" || normalizedUUID.hasPrefix("00002a37") {
      return .hrMonitor
    }
    return .gen5
  }
}

struct GooseBLENotificationContext {
  let activeDeviceName: String
  let connectionState: String
}

struct GooseCommandWriteEvent {
  let deviceID: UUID
  let serviceUUID: String
  let characteristicUUID: String
  let commandName: String
  let commandNumber: UInt8?
  let sequence: UInt8?
  let payload: Data
  let frame: Data
  let writeType: String
  let source: String
  let capturedAt: Date
}

enum GooseSyncToastPhase: String {
  case syncing
  case synced
  case failed
}

struct GooseSyncToast: Identifiable, Equatable {
  let id = UUID()
  let phase: GooseSyncToastPhase
  let title: String
  let detail: String
}

struct GooseHistoricalSyncProgress {
  let status: String
  let detail: String
  let packetCount: Int
  let isTerminal: Bool
  let failed: Bool
  let capturedAt: Date
}

struct GooseHistoricalRangeTelemetry {
  let capturedAt: Date
  let status: String
  let commandSequence: UInt8
  let resultCode: UInt8
  let resultName: String
  let payloadHex: String
  let bodyHex: String
  let revisionOrStatus: UInt8?
  let wordsFromOffset1: [UInt32]
  let pageCurrent: UInt32?
  let pageOldest: UInt32?
  let pageEnd: UInt32?
  let pagesBehind: Int64?
  let pendingResponseCount: Int
  let retryCount: Int
  let notes: String
}

struct GooseSyncFailure: Identifiable, Equatable {
  let id = UUID()
  let title: String
  let message: String
  let occurredAt: Date
}

struct GooseDebugCommandDefinition: Identifiable, Equatable {
  let id: String
  let title: String
  let commandNumber: UInt8
  let family: String
  let risk: String
  let detail: String
  let defaultPayloadHex: String?
  let requiresPayloadHex: Bool
  let payloadHint: String

  var canSendFromButton: Bool {
    defaultPayloadHex != nil || !requiresPayloadHex
  }

  var allowsRemoteInvocation: Bool {
    risk == "read" || risk == "keyed read"
  }

  var remoteURLExample: String {
    guard allowsRemoteInvocation else {
      return "Remote invocation disabled"
    }
    if requiresPayloadHex {
      return "gooseswift://debug-command/\(id)?payload=<hex>"
    }
    return "gooseswift://debug-command/\(id)"
  }
}

struct GooseDebugCommandResponse: Identifiable, Equatable {
  let id: UUID
  let commandID: String
  let title: String
  let commandNumber: UInt8
  let sequence: UInt8
  let requestedAt: Date
  let completedAt: Date?
  let status: String
  let result: String
  let requestPayloadHex: String
  let requestFrameHex: String
  let responsePayloadHex: String
  let responseBodyHex: String
  let source: String

  var summary: String {
    let time = completedAt ?? requestedAt
    let body = responseBodyHex.isEmpty ? "no body" : "body \(responseBodyHex)"
    return "\(status) | \(result) | seq \(sequence) | \(body) | \(time.formatted(date: .omitted, time: .standard))"
  }
}

// MARK: - WhoopGeneration

/// Encapsulates all generation-specific behavior for WHOOP band communication.
/// Adding support for a new generation means adding a case here and filling in
/// the three requirements below — everything else in the app picks it up automatically.
enum WhoopGeneration: CustomStringConvertible {
  case gen4
  case gen5

  // MARK: Detection

  /// Infer generation from the command characteristic that was assigned during GATT discovery.
  static func detect(from characteristic: CBCharacteristic) -> WhoopGeneration {
    characteristic.uuid.uuidString.lowercased().hasPrefix("61080002") ? .gen4 : .gen5
  }

  // MARK: Display

  var description: String {
    switch self {
    case .gen4: return "WHOOP 4.0"
    case .gen5: return "WHOOP 5.0"
    }
  }

  // MARK: Frame building

  /// The hello frame sent immediately after the command characteristic is ready.
  /// Gen5 uses a captured static frame; Gen4 sends GET_HELLO (cmd 145) in Gen4 framing.
  var helloFrame: Data {
    switch self {
    case .gen5: return GooseHello.clientHelloFrame
    case .gen4: return buildCommandFrame(sequence: 0x23, command: 145, data: [0x01])
    }
  }

  /// Build a correctly-framed command packet for this generation.
  func buildCommandFrame(sequence: UInt8, command: UInt8, data: [UInt8]) -> Data {
    switch self {
    case .gen5:
      return CoreBluetoothBLETransport.buildV5CommandFrame(sequence: sequence, command: command, data: data)
    case .gen4:
      return Self.buildGen4CommandFrame(sequence: sequence, command: command, data: data)
    }
  }

  // MARK: Gen4 internals

  /// Gen4 frame layout: [0xaa, len_lo, len_hi, crc8(len_bytes), payload..., crc32 x4]
  ///
  /// Gen4 frames are intentionally unpadded — unlike `buildV5CommandFrame`,
  /// which rounds the payload up to a 4-byte boundary. Confirmed from the
  /// PacketLogger capture of the official iOS app: it emits `cmd 120` with a
  /// 65-byte args field (not a multiple of 4), proving no padding is applied.
  /// Our unpadded frames also round-trip cleanly with the strap.
  private static func buildGen4CommandFrame(sequence: UInt8, command: UInt8, data: [UInt8]) -> Data {
    var payload: [UInt8] = [CoreBluetoothBLETransport.V5PacketType.command, sequence, command]
    payload.append(contentsOf: data)
    let totalLen = payload.count + 4
    let lenBytes: [UInt8] = [UInt8(totalLen & 0xff), UInt8((totalLen >> 8) & 0xff)]
    let headerCRC = crc8(lenBytes)
    var frame: [UInt8] = [0xaa, lenBytes[0], lenBytes[1], headerCRC]
    frame.append(contentsOf: payload)
    let payloadCRC = CoreBluetoothBLETransport.crc32(payload)
    frame.append(contentsOf: [
      UInt8(payloadCRC & 0xff),
      UInt8((payloadCRC >> 8) & 0xff),
      UInt8((payloadCRC >> 16) & 0xff),
      UInt8((payloadCRC >> 24) & 0xff),
    ])
    return Data(frame)
  }

  /// CRC-8, polynomial 0x07, init 0x00 — matches Rust protocol.rs implementation.
  private static func crc8(_ bytes: [UInt8]) -> UInt8 {
    var crc = UInt8(0)
    for byte in bytes {
      crc ^= byte
      for _ in 0..<8 {
        crc = crc & 0x80 != 0 ? (crc << 1) ^ 0x07 : crc << 1
      }
    }
    return crc
  }
}


// MARK: - WireProtocol

enum WireProtocol: String, Decodable {
  case gen4
  case gen5
  case hrMonitor = "hr_monitor"

  var bridgeString: String {
    switch self {
    case .gen4: return "GEN4"
    case .gen5: return "GOOSE"
    case .hrMonitor: return "HR_MONITOR"
    }
  }
}

enum HistoricalSyncKind: String, Decodable {
  case pageSequence = "page_sequence"
  case stream
}

struct DeviceCapabilities: Decodable {
  let wireProtocol: WireProtocol
  let historicalSync: HistoricalSyncKind
  let batteryViaR22: Bool
  let batteryViaEvent48: Bool
  let batteryViaCMD26: Bool
  let r22Realtime: Bool
  // Plain String (not enum) to avoid decode failures on unknown future variants.
  // Valid values: "WHOOP4", "WHOOP5", "WHOOP_MG", "HR_MONITOR".
  let deviceKind: String
  // Discovered via GET_FF_VALUE (cmd 0x80) on reconnect; empty when not yet known or timed out.
  let featureFlags: [UInt8: UInt8]

  enum CodingKeys: String, CodingKey {
    case wireProtocol = "wire_protocol"
    case historicalSync = "historical_sync"
    case batteryViaR22 = "battery_via_r22"
    case batteryViaEvent48 = "battery_via_event48"
    case batteryViaCMD26 = "battery_via_cmd26"
    case r22Realtime = "r22_realtime"
    case deviceKind = "device_kind"
    case featureFlags = "feature_flags"
  }

  init(from decoder: Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    wireProtocol = try c.decode(WireProtocol.self, forKey: .wireProtocol)
    historicalSync = try c.decode(HistoricalSyncKind.self, forKey: .historicalSync)
    batteryViaR22 = try c.decode(Bool.self, forKey: .batteryViaR22)
    batteryViaEvent48 = try c.decode(Bool.self, forKey: .batteryViaEvent48)
    batteryViaCMD26 = try c.decode(Bool.self, forKey: .batteryViaCMD26)
    r22Realtime = try c.decode(Bool.self, forKey: .r22Realtime)
    deviceKind = try c.decode(String.self, forKey: .deviceKind)
    // feature_flags may be absent from bridge responses that predate Phase 115; default to empty.
    if let raw = try c.decodeIfPresent([String: UInt8].self, forKey: .featureFlags) {
      var parsed: [UInt8: UInt8] = [:]
      for (k, v) in raw {
        if let index = UInt8(k) {
          parsed[index] = v
        }
      }
      featureFlags = parsed
    } else {
      featureFlags = [:]
    }
  }

  init(
    wireProtocol: WireProtocol,
    historicalSync: HistoricalSyncKind,
    batteryViaR22: Bool,
    batteryViaEvent48: Bool,
    batteryViaCMD26: Bool,
    r22Realtime: Bool,
    deviceKind: String,
    featureFlags: [UInt8: UInt8] = [:]
  ) {
    self.wireProtocol = wireProtocol
    self.historicalSync = historicalSync
    self.batteryViaR22 = batteryViaR22
    self.batteryViaEvent48 = batteryViaEvent48
    self.batteryViaCMD26 = batteryViaCMD26
    self.r22Realtime = r22Realtime
    self.deviceKind = deviceKind
    self.featureFlags = featureFlags
  }
}

// MARK: - BLE Bonding State

enum GooseBLEBondingState: Hashable {
  case notStarted
  case started
  case subscribed
  case completed(deviceID: UUID)
  case cancelled(reason: String)

  var isReady: Bool {
    if case .completed = self { return true }
    return false
  }

  var connectionStateString: String {
    switch self {
    case .notStarted:          return "disconnected"
    case .started:             return "connecting"
    case .subscribed:          return "discovering"
    case .completed:           return "ready"
    case .cancelled(let r):    return r.isEmpty ? "disconnected" : r
    }
  }

  var persistenceKey: String {
    switch self {
    case .notStarted:   return "notStarted"
    case .started:      return "started"
    case .subscribed:   return "subscribed"
    case .completed:    return "completed"
    case .cancelled:    return "notStarted"
    }
  }
}

// MARK: - BLE Bonding Events

/// Events that drive `GooseBLEBondingState` transitions inside `GooseBLEBondingManager`.
enum GooseBLEBondingEvent {
  case start
  case subscribe
  case complete(deviceID: UUID)
  case cancel(reason: String)
  case reset
}

/// Transition table encoding the legal bonding graph.
///
/// Legal edges:
///   notStarted           + start     → started
///   completed            + start     → started   (reconnect after cold-start BT restoration)
///   started              + subscribe → subscribed
///   completed            + subscribe → subscribed (fast reconnect when peripheral already connected)
///   subscribed           + complete  → completed(deviceID:)
///   any                  + reset     → notStarted
///   any                  + cancel    → cancelled(reason:)
///
/// All other (state, event) pairs return nil — invalid transition.
func gooseBLEBondingTransition(
  _ state: GooseBLEBondingState,
  _ event: GooseBLEBondingEvent
) -> GooseBLEBondingState? {
  switch event {
  case .reset:
    return .notStarted
  case .cancel(let reason):
    return .cancelled(reason: reason)
  case .start:
    // .completed is valid here: iOS BT state restoration may deliver willRestoreState
    // while the machine is still .completed (restored from UserDefaults), before the
    // peripheral has had a chance to disconnect and reset through the normal path.
    switch state {
    case .notStarted, .completed:
      return .started
    default:
      return nil
    }
  case .subscribe:
    // .completed is valid here: willRestoreState with peripheral.state == .connected
    // arrives before any disconnect, so the machine may still be .completed.
    switch state {
    case .started, .completed:
      return .subscribed
    default:
      return nil
    }
  case .complete(let deviceID):
    guard case .subscribed = state else { return nil }
    return .completed(deviceID: deviceID)
  }
}

