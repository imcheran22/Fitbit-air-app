import CoreBluetooth
import Foundation
import OSLog


extension GooseBLEClient {
  func sendCmd26BatteryRequest() {
    guard connectionState == "ready" else {
      record(level: .debug, source: "ble.battery", title: "cmd26.battery.skipped", body: "connectionState=\(connectionState)")
      return
    }
    guard let activePeripheral, let commandCharacteristic else {
      record(level: .debug, source: "ble.battery", title: "cmd26.battery.skipped", body: "no active peripheral or command characteristic")
      return
    }
    guard let writeType = writeType(for: commandCharacteristic) else {
      record(level: .debug, source: "ble.battery", title: "cmd26.battery.skipped", body: "command characteristic is not writable")
      return
    }
    let sequence = nextCmd26BatterySequence()
    let frame = whoopGenerationFromCapabilities().buildCommandFrame(
      sequence: sequence,
      command: BatteryCommandKind.getBatteryLevel.commandNumber,
      data: BatteryCommandKind.getBatteryLevel.payload
    )
    activePeripheral.writeValue(frame, for: commandCharacteristic, type: writeType)
    record(
      source: "ble.battery",
      title: "cmd26.battery.sent",
      body: "seq=\(sequence) command=\(BatteryCommandKind.getBatteryLevel.commandNumber) frame=\(frame.hexString)"
    )
  }

  func nextCmd26BatterySequence() -> UInt8 {
    let sequence = nextCmd26BatteryCommandSequence
    nextCmd26BatteryCommandSequence = nextCmd26BatteryCommandSequence == UInt8.max ? 48 : nextCmd26BatteryCommandSequence + 1
    return sequence
  }

  func handleBatteryValue(_ value: Data, characteristic: CBCharacteristic) {
    guard notificationCharacteristicIDs.contains(characteristic.uuid) else {
      return
    }
    for frame in frames(in: value) {
      guard let payload = payload(in: frame),
            payload.count >= 5,
            let packetType = payload.first,
            packetType == V5PacketType.commandResponse || packetType == V5PacketType.puffinCommandResponse,
            payload[2] == 26 else {
        continue
      }
      handleCmd26BatteryResponse(payload)
    }
  }

  func handleCmd26BatteryResponse(_ payload: [UInt8]) {
    guard payload.count >= 4 else {
      record(level: .warn, source: "ble.battery", title: "cmd26.response.too_short", body: "count=\(payload.count)")
      return
    }
    guard payload.count >= 5, payload[4] == 1 else {
      let resultCode: UInt8 = payload.count >= 5 ? payload[4] : 0
      record(level: .warn, source: "ble.battery", title: "cmd26.response.failed", body: "resultCode=\(resultCode)")
      return
    }
    let payloadHex = Data(payload).hexString
    DispatchQueue.global(qos: .utility).async { [weak self] in
      guard let self else { return }
      do {
        let result = try self.historicalDirectWriteBridge.request(
          method: "battery.parse_cmd26_response",
          args: ["payload_hex": payloadHex]
        )
        if let pct = NotificationFrameParser.intValue(result["battery_pct"]) {
          self.applyBatteryLevel(pct, capturedAt: Date(), sourceTitle: "cmd26.battery")
        }
      } catch {
        self.record(level: .warn, source: "ble.battery", title: "cmd26.parse.failed", body: error.localizedDescription)
      }
    }
  }
}
