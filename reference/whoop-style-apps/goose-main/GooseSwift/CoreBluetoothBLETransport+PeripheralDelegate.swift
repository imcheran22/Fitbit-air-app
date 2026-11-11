import CoreBluetooth
import Foundation
import OSLog

extension CoreBluetoothBLETransport: CBPeripheralDelegate {
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if dispatchCoreBluetoothDelegateToMainIfNeeded({ [weak self] in
      self?.peripheral(peripheral, didDiscoverServices: error)
    }) {
      return
    }

    if let error {
      updateConnectionState(error.localizedDescription)
      record(level: .error, source: "ble", title: "gatt.services.failed", body: error.localizedDescription)
      return
    }
    let services = peripheral.services ?? []
    record(source: "ble", title: "gatt.services", body: uuidList(services.map(\.uuid)))
    let hasWhoopService = services.contains(where: { isWhoopService($0.uuid) })
    if hasWhoopService {
      whoopCandidateIDs.insert(peripheral.identifier)
    } else if whoopCandidateIDs.contains(peripheral.identifier)
        || activePeripheral?.identifier == peripheral.identifier
        || rememberedDeviceID == peripheral.identifier {
      record(level: .debug, source: "ble", title: "gatt.services.partial", body: uuidList(services.map(\.uuid)))
    } else {
      rejectNonWhoopPeripheral(peripheral, reason: "gatt_missing_whoop_service", disconnect: true)
      return
    }
    for service in services {
      peripheral.discoverCharacteristics(nil, for: service)
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    if dispatchCoreBluetoothDelegateToMainIfNeeded({ [weak self] in
      self?.peripheral(peripheral, didDiscoverCharacteristicsFor: service, error: error)
    }) {
      return
    }

    if let error {
      updateConnectionState(error.localizedDescription)
      record(level: .error, source: "ble", title: "gatt.characteristics.failed", body: "\(service.uuid.uuidString) \(error.localizedDescription)")
      return
    }

    if service.uuid == batteryServiceID {
      batteryCharacteristicDiscoveryPending = false
    }

    let characteristics = service.characteristics ?? []
    let characteristicSummary = characteristics
      .map { "\($0.uuid.uuidString)[\(propertyNames($0.properties))]" }
      .joined(separator: ",")
    record(source: "ble", title: "gatt.characteristics", body: "\(service.uuid.uuidString) \(characteristicSummary)")

    processDiscoveredCharacteristics(characteristics, for: service, peripheral: peripheral, cached: false)
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    let capturedAt = Date()
    let value = characteristic.value
    if !Thread.isMainThread,
       error == nil,
       let value,
       characteristic.uuid == standardHeartRateMeasurementID {
      let event = notificationEvent(
        peripheral,
        characteristic: characteristic,
        value: value,
        capturedAt: capturedAt
      )
      fanOutRawNotification(event)
      handleStandardHeartRate(value, characteristic: characteristic, capturedAt: capturedAt)
      return
    }
    if !Thread.isMainThread,
       error == nil,
       let value,
       shouldFanOutNotificationBeforeMain(characteristic) {
      let event = notificationEvent(
        peripheral,
        characteristic: characteristic,
        value: value,
        capturedAt: capturedAt
      )
      fanOutNotification(event)
      guard shouldDispatchNotificationSideEffectsToMain(value, characteristic: characteristic) else {
        recordSkippedNotificationSideEffect(value, characteristic: characteristic, capturedAt: capturedAt)
        publishNotificationSyncTimestampIfNeeded(capturedAt)
        return
      }
      DispatchQueue.main.async { [weak self] in
        self?.handlePeripheralValueUpdate(
          peripheral,
          characteristic: characteristic,
          value: value,
          capturedAt: capturedAt,
          error: nil,
          fanOutNotifications: false
        )
      }
      return
    }
    if dispatchCoreBluetoothDelegateToMainIfNeeded({ [weak self] in
      self?.handlePeripheralValueUpdate(
        peripheral,
        characteristic: characteristic,
        value: value,
        capturedAt: capturedAt,
        error: error,
        fanOutNotifications: true
      )
    }) {
      return
    }
    handlePeripheralValueUpdate(
      peripheral,
      characteristic: characteristic,
      value: value,
      capturedAt: capturedAt,
      error: error,
      fanOutNotifications: true
    )
  }

  func shouldFanOutNotificationBeforeMain(_ characteristic: CBCharacteristic) -> Bool {
    guard !standardReadableCharacteristic(characteristic),
          characteristic.uuid != standardHeartRateMeasurementID else {
      return false
    }
    return characteristic.properties.contains(.notify)
      || characteristic.properties.contains(.indicate)
  }

  func shouldDispatchNotificationSideEffectsToMain(_ value: Data, characteristic: CBCharacteristic) -> Bool {
    guard notificationCharacteristicIDs.contains(characteristic.uuid) else {
      return false
    }

    for frame in frames(in: value) {
      guard let payload = payload(in: frame),
            let packetType = payload.first else {
        continue
      }
      switch packetType {
      case V5PacketType.commandResponse,
           V5PacketType.puffinCommandResponse,
           V5PacketType.event,
           V5PacketType.metadata,
           V5PacketType.puffinMetadata:
        return true
      case V5PacketType.historicalData,
           V5PacketType.historicalIMUDataStream:
        // Route historical body packets to the main handler only while a sync
        // is active. Outside a sync these are high-rate live-stream frames that
        // should stay off-main for performance. Without this guard,
        // historicalPacketsReceivedThisSync is never incremented and every
        // sync fails with "no packet47 bodies" even when the band is streaming.
        // SAFETY: isHistoricalSyncing set+read on same CB notification queue — no lock needed.
        if isHistoricalSyncing {
          return true
        }
        continue
      default:
        continue
      }
    }
    return false
  }

  func recordSkippedNotificationSideEffect(
    _ value: Data,
    characteristic: CBCharacteristic,
    capturedAt: Date
  ) {
    notificationSideEffectSkipCount += 1
    notificationSideEffectSkipBytes += value.count
    let shouldLog = notificationSideEffectSkipCount == 1
      || notificationSideEffectSkipCount.isMultiple(of: Self.notificationSideEffectSkipLogStride)
      || capturedAt.timeIntervalSince(lastNotificationSideEffectSkipLoggedAt) >= Self.notificationSideEffectSkipLogInterval
    guard shouldLog else {
      return
    }
    lastNotificationSideEffectSkipLoggedAt = capturedAt
    record(
      source: "ble.perf",
      title: "notification.side_effect.skipped",
      body: "count=\(notificationSideEffectSkipCount) bytes=\(notificationSideEffectSkipBytes) char=\(characteristic.uuid.uuidString) reason=data_stream_no_control_frame main_handler=false"
    )
  }

  func publishNotificationSyncTimestampIfNeeded(_ capturedAt: Date) {
    guard capturedAt.timeIntervalSince(lastNotificationSyncPublishedAt) >= Self.notificationSyncPublishInterval else {
      return
    }
    lastNotificationSyncPublishedAt = capturedAt
    bleUIStateAggregator.publishLastSyncAt(capturedAt)
  }

  func notificationEvent(
    _ peripheral: CBPeripheral,
    characteristic: CBCharacteristic,
    value: Data,
    capturedAt: Date
  ) -> GooseNotificationEvent {
    GooseNotificationEvent(
      deviceID: peripheral.identifier,
      serviceUUID: characteristic.service?.uuid.uuidString ?? "",
      characteristicUUID: characteristic.uuid.uuidString,
      value: value,
      capturedAt: capturedAt
    )
  }

  func fanOutNotification(_ event: GooseNotificationEvent) {
    fanOutRawNotification(event)
    onNotification?(event)
  }

  func fanOutRawNotification(_ event: GooseNotificationEvent) {
    if let onRawNotificationWithContext {
      onRawNotificationWithContext(event, notificationContextSnapshot())
    } else {
      onRawNotification?(event)
    }
  }

  func handlePeripheralValueUpdate(
    _ peripheral: CBPeripheral,
    characteristic: CBCharacteristic,
    value: Data?,
    capturedAt: Date,
    error: Error?,
    fanOutNotifications: Bool = true
  ) {
    let readValue = standardReadableCharacteristic(characteristic)
    if let error {
      record(
        level: .error,
        source: "ble",
        title: readValue ? "metadata.read.failed" : "notification.error",
        body: error.localizedDescription
      )
      if readValue {
        scheduleMetadataReadRetryIfNeeded(for: characteristic)
      }
      return
    }
    guard let value else {
      record(
        level: .warn,
        source: "ble",
        title: readValue ? "metadata.read.empty" : "notification.empty",
        body: characteristic.uuid.uuidString
      )
      if readValue {
        scheduleMetadataReadRetryIfNeeded(for: characteristic)
      }
      return
    }

    let event = notificationEvent(
      peripheral,
      characteristic: characteristic,
      value: value,
      capturedAt: capturedAt
    )
    if fanOutNotifications {
      fanOutRawNotification(event)
    }

    if handleStandardReadValue(value, characteristic: characteristic, capturedAt: capturedAt) {
      return
    }
    if characteristic.uuid == standardHeartRateMeasurementID {
      handleStandardHeartRate(value, characteristic: characteristic, capturedAt: capturedAt)
      return
    }

    handleDebugCommandValue(value, characteristic: characteristic)
    handleHistoricalSyncValue(value, characteristic: characteristic)
    handleAlarmValue(value, characteristic: characteristic)
    handleSensorStreamValue(value, characteristic: characteristic)
    handleClockValue(value, characteristic: characteristic)
    handleBatteryValue(value, characteristic: characteristic)
    handleBodyLocationValue(value, characteristic: characteristic)
    handleFeatureFlagValue(value, characteristic: characteristic)  // FF-01/FF-02
    handleCapSenseEventValue(value, characteristic: characteristic)

    bleUIStateAggregator.publishLastSyncAt(event.capturedAt)
    record(
      level: .debug,
      source: "ble",
      title: "notification.received",
      body: "\(event.characteristicUUID) bytes=\(value.count)"
    )
    // During historical sync, historical data packets are written directly to SQLite
    // via flushPendingHistoricalFramesIfNeeded(). Skip the unbounded async notification
    // pipeline for those packets to prevent memory pressure and jetsam kills.
    let suppressNotification = historicalManager.lastHandledWasHistoricalDataPacket
    historicalManager.lastHandledWasHistoricalDataPacket = false
    if fanOutNotifications && !suppressNotification {
      onNotification?(event)
    }
  }

  // CAPSENSE-01: Parse EVENTS_FROM_STRAP (fd4b0004 / PUFFIN 61080004) notifications for
  // cap sense on-wrist state. Event types 10 (STRAP_DETECTED) and 11 (STRAP_REMOVED)
  // arrive as UInt16 little-endian at bytes 2-3 of the event payload.
  // SAFETY: shouldDispatchNotificationSideEffectsToMain pre-routes V5PacketType.event
  // frames to main before handlePeripheralValueUpdate is called; the DispatchQueue.main.async
  // below is a safe no-op when already on main and prevents a retain cycle via [weak self].
  func handleCapSenseEventValue(_ value: Data, characteristic: CBCharacteristic) {
    guard notificationCharacteristicIDs.contains(characteristic.uuid) else { return }
    for frame in frames(in: value) {
      guard let payload = payload(in: frame),
            payload.count >= 4,
            let packetType = payload.first,
            packetType == V5PacketType.event else {
        continue
      }
      let eventType = UInt16(payload[2]) | (UInt16(payload[3]) << 8)
      switch eventType {
      case 10: // STRAP_DETECTED
        record(
          source: "ble.capsense",
          title: "cap_sense.event",
          body: "eventType=10 STRAP_DETECTED isOnWrist=true"
        )
        DispatchQueue.main.async { [weak self] in
          self?.isOnWrist = true
        }
      case 11: // STRAP_REMOVED
        record(
          source: "ble.capsense",
          title: "cap_sense.event",
          body: "eventType=11 STRAP_REMOVED isOnWrist=false"
        )
        DispatchQueue.main.async { [weak self] in
          self?.isOnWrist = false
        }
      default:
        break
      }
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didWriteValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    if dispatchCoreBluetoothDelegateToMainIfNeeded({ [weak self] in
      self?.peripheral(peripheral, didWriteValueFor: characteristic, error: error)
    }) {
      return
    }

    if let error {
      // BLE-REL-01: on insufficientAuthentication, schedule a single retry after 2.5s.
      // The WHOOP pairing process occasionally triggers this on the first write after
      // reconnect; a short delay allows the authentication handshake to complete.
      // The original write data is not available here via CBPeripheralDelegate, so the
      // retry surfaces a user-visible actionable error on second failure rather than
      // replaying the exact bytes. Max one retry — no infinite loop possible.
      if let attError = error as? CBATTError, attError.code == .insufficientAuthentication {
        if !authRetryPending {
          authRetryPending = true
          record(level: .warn, source: "ble", title: "write.auth.retry.scheduled", body: characteristic.uuid.uuidString)
          DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { [weak self] in
            guard let self else { return }
            self.authRetryPending = false
            // Retry path: notify the system the auth challenge resolved. If the pending
            // command is still active it will be retried by the caller when the characteristic
            // becomes writable again after re-pairing. Emit an actionable error so the user
            // knows to reconnect if the issue persists.
            self.updateConnectionState("Authentication failed — please reconnect WHOOP")
            self.record(
              level: .error,
              source: "ble",
              title: "write.auth.retry.failed",
              body: "insufficientAuthentication persists on \(characteristic.uuid.uuidString); user action required"
            )
            // BUG-AUTH-01: increment exhaustion counter; surface recovery alert after 12 cycles.
            self.authRetryCount += 1
            if self.authRetryCount >= 12 {
              self.authRetryCount = 0
              self.authExhausted = true
              return
            }
          }
          return
        }
        // Second failure after the retry window: reset flag and fall through to show error.
        authRetryPending = false
        updateConnectionState("Authentication failed — please reconnect WHOOP")
        record(
          level: .error,
          source: "ble",
          title: "write.auth.failed",
          body: "insufficientAuthentication (retry exhausted) on \(characteristic.uuid.uuidString)"
        )
        // BUG-AUTH-01: increment exhaustion counter; surface recovery alert after 12 cycles.
        authRetryCount += 1
        if authRetryCount >= 12 {
          authRetryCount = 0
          authExhausted = true
          return
        }
        return
      }
      record(level: .error, source: "ble", title: "write.failed", body: "\(characteristic.uuid.uuidString) \(error.localizedDescription)")
      if isHistoricalSyncing && characteristic.uuid == commandCharacteristic?.uuid {
        failHistoricalSync("Write to \(characteristic.uuid.uuidString) failed during historical sync: \(error.localizedDescription)")
      }
      if pendingAlarmCommand != nil && characteristic.uuid == commandCharacteristic?.uuid {
        failAlarmCommand("Write to \(characteristic.uuid.uuidString) failed during alarm command: \(error.localizedDescription)")
      }
      if pendingClockCommand != nil && characteristic.uuid == commandCharacteristic?.uuid {
        failClockCommand("Write to \(characteristic.uuid.uuidString) failed during clock command: \(error.localizedDescription)")
      }
      if !pendingDebugCommands.isEmpty && characteristic.uuid == commandCharacteristic?.uuid {
        failAllDebugCommands("Write to \(characteristic.uuid.uuidString) failed during debug command: \(error.localizedDescription)")
      }
    } else {
      authRetryPending = false
      authRetryCount = 0
      authExhausted = false
      record(source: "ble", title: "write.accepted", body: characteristic.uuid.uuidString)
    }
  }

  func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateNotificationStateFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    if dispatchCoreBluetoothDelegateToMainIfNeeded({ [weak self] in
      self?.peripheral(peripheral, didUpdateNotificationStateFor: characteristic, error: error)
    }) {
      return
    }

    if let error {
      record(level: .error, source: "ble", title: "notify.failed", body: "\(characteristic.uuid.uuidString) \(error.localizedDescription)")
    } else {
      let state = characteristic.isNotifying ? "subscribed" : "unsubscribed"
      record(source: "ble", title: "notify.state", body: "\(characteristic.uuid.uuidString) \(state)")
    }
  }

}
