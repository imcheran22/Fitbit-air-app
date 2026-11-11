import Foundation


extension GooseAppModel {

  // One-shot guard: ensures health check runs at most once per app session.
  // Stored as a nonisolated var on a private wrapper to work around extension
  // stored-property restrictions; access is always on @MainActor.
  private static var _didRunHealthCheck = false

  func configureUploadService() {
    uploadService.onStatusUpdate = { [weak self] status in
      // Called on @MainActor via Task { @MainActor in ... } in GooseUploadService
      self?.syncState.lastUploadAt = status.lastUploadTimestamp
      self?.syncState.pendingBatchCount = status.pendingBatchCount
      self?.syncState.lastSyncedCount = status.lastSyncedCount
      self?.syncState.syncPendingRowCount = status.pendingRowCount
      self?.syncState.uploadErrorState = status.uploadErrorState
    }
  }

  // Called by GooseAppDelegate when APNs registration succeeds.
  // Stores the device token, logs it, and triggers a deferred upload if network is available.
  func setAPNSDeviceToken(_ token: String?) {
    syncState.apnsDeviceToken = token
    ble.record(source: "app.apns", title: "token.registered")
    if syncState.isNetworkReachable, syncState.hasPendingUploadAfterReconnect {
      syncState.hasPendingUploadAfterReconnect = false
      syncState.uploadErrorState = nil
      triggerManualUpload()
    }
  }

  func refreshSyncPendingCount() {
    let service = uploadService
    Task.detached(priority: .utility) {
      service.refreshPendingRowCount()
    }
  }

  func triggerBackfillAndUpload() {
    guard syncState.apnsDeviceToken != nil else {
      ble.record(level: .warn, source: "upload.gate", title: "skip.no_apns_token")
      return
    }
    guard syncState.isNetworkReachable else {
      syncState.hasPendingUploadAfterReconnect = true
      ble.record(level: .info, source: "upload.gate", title: "skip.offline")
      return
    }
    let sinceTimestamp = syncState.lastUploadAt ?? Date().addingTimeInterval(-7 * 24 * 3600)
    if let whoopID = ble.activeDeviceIdentifier {
      let whoopType = ble.connectedCapabilities?.wireProtocol.bridgeString ?? "GOOSE"
      uploadService.triggerBackfill(deviceID: whoopID, deviceType: whoopType, sinceTimestamp: sinceTimestamp)
    }
  }

  func triggerManualUpload() {
    guard syncState.apnsDeviceToken != nil else {
      ble.record(level: .warn, source: "upload.gate", title: "skip.no_apns_token")
      return
    }
    guard syncState.isNetworkReachable else {
      syncState.hasPendingUploadAfterReconnect = true
      ble.record(level: .info, source: "upload.gate", title: "skip.offline")
      return
    }
    let sinceTimestamp = syncState.lastUploadAt ?? Date().addingTimeInterval(-24 * 3600)

    if let whoopID = ble.activeDeviceIdentifier {
      let whoopType = ble.connectedCapabilities?.wireProtocol.bridgeString ?? "GOOSE"
      uploadService.upload(deviceID: whoopID, deviceType: whoopType, sinceTimestamp: sinceTimestamp)
    }

    // HR monitor upload: trigger when an HR monitor is connected, using the sanitized device name.
    // The upload service default case tags this payload with device_class: "HR_MONITOR".
    let hrManager = ble.hrMonitorManager
    if hrManager.hrConnectionState != "disconnected", let hrPeripheral = hrManager.hrPeripheral {
      let hrDeviceType = hrManager.connectedDeviceName ?? "unknown_hr_monitor"
      uploadService.upload(
        deviceID: hrPeripheral.identifier,
        deviceType: hrDeviceType,
        sinceTimestamp: sinceTimestamp
      )
    }
  }

  // Call this on user logout or WHOOP device swap so the new device's historical data
  // is not silently skipped by an old watermark (RESEARCH Pitfall 4).
  // Resets lastUploadAt so the next upload falls back to the default lookback window.
  func clearAllUploadWatermarks() {
    GooseUploadWatermark.clearAllWatermarks()
    syncState.lastUploadAt = nil
  }

  func triggerUpload(for result: CaptureFrameWriteResult, deviceEvent: GooseNotificationEvent) {
    guard result.pass, result.errorDescription == nil else { return }
    guard syncState.apnsDeviceToken != nil else {
      ble.record(level: .warn, source: "upload.gate", title: "skip.no_apns_token")
      return
    }
    guard syncState.isNetworkReachable else {
      syncState.hasPendingUploadAfterReconnect = true
      ble.record(level: .info, source: "upload.gate", title: "skip.offline")
      return
    }
    // sinceTimestamp: 30 seconds ago covers the batch window generously
    let sinceTimestamp = Date().addingTimeInterval(-30)
    uploadService.upload(
      deviceID: deviceEvent.deviceID,
      deviceType: deviceEvent.wireProtocol.bridgeString,
      sinceTimestamp: sinceTimestamp
    )
  }

  // Imports raw BLE frames from the remote server into the local SQLite via
  // capture.import_frame_batch. This rebuilds the trust chain (capture_sessions
  // and raw_evidence) so HRV/Recovery/Strain algorithms unlock without needing
  // a BLE reconnection on a fresh install.
  //
  // Flow:
  //   1. Fetch device list from /v1/devices
  //   2. For each device, page through /v1/export/frames/{id} (5,000 frames/page)
  //   3. For each page, call capture.import_frame_batch which creates capture_sessions
  //      and inserts raw_evidence rows with a proper trust chain
  //   4. After all frames are imported, call sync.backfill_streams to derive decoded
  //      HR/RR streams from the imported frames
  //
  // Safe on a fresh install — capture.import_frame_batch is idempotent.
  func importHistoricalDataFromServer() {
    guard !syncState.serverImportInProgress else { return }
    let serverURLString = UserDefaults.standard.string(forKey: RemoteServerStorage.serverURL) ?? ""
    guard !serverURLString.isEmpty, let baseURL = URL(string: serverURLString) else { return }
    guard let token = (try? RemoteServerKeychain.loadToken()) ?? nil, !token.isEmpty else { return }
    let db = HealthDataStore.defaultDatabasePath()
    let bridge = GooseRustBridge()
    syncState.serverImportInProgress = true

    Task.detached(priority: .utility) { [weak self] in
      guard let self else { return }

      // Step 1: fetch device list from server
      var devicesRequest = URLRequest(url: baseURL.appendingPathComponent("v1/devices"))
      devicesRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      devicesRequest.timeoutInterval = 10
      guard let (devData, devResp) = try? await URLSession.shared.data(for: devicesRequest),
            (devResp as? HTTPURLResponse)?.statusCode == 200,
            let devJson = try? JSONSerialization.jsonObject(with: devData) as? [[String: Any]]
      else {
        await MainActor.run { [weak self] in self?.syncState.serverImportInProgress = false }
        return
      }

      let deviceIDs = devJson.compactMap { $0["device_id"] as? String }
      guard !deviceIDs.isEmpty else {
        await MainActor.run { [weak self] in self?.syncState.serverImportInProgress = false }
        return
      }

      var totalFrames = 0

      // Step 2: for each device, page through /v1/export/frames/{id}
      for deviceID in deviceIDs {
        var fromTs: Double = 0.0
        let toTs: Double = Date().timeIntervalSince1970
        let pageSize = 5000
        var pageCount = 0
        let maxPages = 200

        repeat {
          pageCount += 1
          guard pageCount <= maxPages else { break }
          var components = URLComponents(
            url: baseURL.appendingPathComponent("v1/export/frames/\(deviceID)"),
            resolvingAgainstBaseURL: false
          )
          components?.queryItems = [
            URLQueryItem(name: "from", value: String(fromTs)),
            URLQueryItem(name: "to", value: String(toTs)),
            URLQueryItem(name: "limit", value: String(pageSize)),
          ]
          guard let url = components?.url else { break }
          var request = URLRequest(url: url)
          request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
          request.timeoutInterval = 60

          guard let (data, response) = try? await URLSession.shared.data(for: request),
                (response as? HTTPURLResponse)?.statusCode == 200,
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
          else { break }

          let rawFrames = json["frames"] as? [[String: Any]] ?? []
          guard !rawFrames.isEmpty else { break }

          // Step 3: convert server frames to capture.import_frame_batch format.
          // evidence_id and frame_id are derived deterministically from the frame data
          // so repeated imports produce the same IDs (idempotent).
          let bridgeFrames: [[String: Any]] = rawFrames.compactMap { f in
            guard let capturedAtUnix = f["captured_at_unix"] as? Double,
                  capturedAtUnix.isFinite, capturedAtUnix > 0,
                  let frameHex = f["frame_hex"] as? String else { return nil }
            let source = f["source"] as? String ?? "ios.corebluetooth.notification"
            let deviceModel = f["device_model"] as? String ?? "WHOOP 5.0 Goose"
            let sensitivity = f["sensitivity"] as? String ?? "user-owned-capture"
            let deviceType = f["device_type"] as? String ?? "GOOSE"
            // Deterministic evidence_id: "server-import/<deviceID>/<capturedAtMs>/<hexPrefix8>"
            let capturedAtMs = Int64(capturedAtUnix * 1000)
            let hexPrefix = String(frameHex.prefix(8))
            let evidenceID = "server-import/\(deviceID)/\(capturedAtMs)/\(hexPrefix)"
            let frameID = "\(evidenceID).frame.0"
            // captured_at for Rust: ISO-8601 UTC string
            let capturedAtISO = self.isoFromUnix(capturedAtUnix)
            return [
              "evidence_id": evidenceID,
              "frame_id": frameID,
              "source": source,
              "captured_at": capturedAtISO,
              "device_model": deviceModel,
              "frame_hex": frameHex,
              "sensitivity": sensitivity,
              "capture_session_id": NSNull(),
              "device_type": deviceType,
            ]
          }

          if !bridgeFrames.isEmpty {
            do {
              _ = try bridge.request(
                method: "capture.import_frame_batch",
                args: [
                  "database_path": db,
                  "parser_version": "server-import/1.0",
                  "include_timeline_rows": false,
                  "compact_raw_payloads": false,
                  "include_results": false,
                  "frames": bridgeFrames,
                ]
              )
              totalFrames += bridgeFrames.count
            } catch {
              let msg = "\(error)"
              Task { @MainActor [weak self] in self?.ble.record(level: .error, source: "bridge", title: "capture.import_frame_batch", body: msg) }
              continue
            }
          }

          // Paginate: advance fromTs past the last frame's timestamp.
          if let lastFrame = rawFrames.last,
             let lastTs = lastFrame["captured_at_unix"] as? Double,
             rawFrames.count >= pageSize {
            fromTs = lastTs + 0.001
          } else {
            break
          }
        } while true

        // Step 4: backfill decoded HR/RR streams from the imported raw frames.
        do {
          _ = try bridge.request(
            method: "sync.backfill_streams",
            args: [
              "database_path": db,
              "device_id": deviceID,
              "start_ts": 0.0,
              "end_ts": Date().timeIntervalSince1970,
            ]
          )
        } catch {
          let msg = "\(error)"
          Task { @MainActor [weak self] in self?.ble.record(level: .error, source: "bridge", title: "sync.backfill_streams", body: msg) }
        }
      }

      let frames = totalFrames
      await MainActor.run { [weak self] in
        self?.syncState.serverImportInProgress = false
        self?.syncState.serverImportLastFrameCount = frames
        self?.ble.record(
          level: .debug,
          source: "import.server",
          title: "import.complete",
          body: "raw_frames=\(frames) devices=\(deviceIDs.count)"
        )
      }
    }
  }

  // Converts a Unix timestamp (seconds) to an ISO-8601 UTC string suitable for
  // the Rust bridge captured_at field format: "YYYY-MM-DDTHH:MM:SS.mmmZ".
  nonisolated private func isoFromUnix(_ ts: Double) -> String {
    let date = Date(timeIntervalSince1970: ts)
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }

  // Manual connection test — hits /healthz then /v1/devices (auth-gated).
  // Reports inline result via connectionTestResult.
  func testServerConnection() {
    guard !syncState.connectionTestRunning else { return }
    let serverURLString = UserDefaults.standard.string(forKey: RemoteServerStorage.serverURL) ?? ""
    guard !serverURLString.isEmpty, let baseURL = URL(string: serverURLString) else {
      syncState.connectionTestResult = "No server URL configured."
      return
    }
    guard let token = (try? RemoteServerKeychain.loadToken()) ?? nil, !token.isEmpty else {
      syncState.connectionTestResult = "No API token configured."
      return
    }
    syncState.connectionTestRunning = true
    syncState.connectionTestResult = nil
    Task.detached(priority: .utility) { [weak self] in
      guard let self else { return }
      // Step 1: /healthz
      var healthzReq = URLRequest(url: baseURL.appendingPathComponent("healthz"))
      healthzReq.timeoutInterval = 5
      guard let (_, healthzResp) = try? await URLSession.shared.data(for: healthzReq),
            (healthzResp as? HTTPURLResponse)?.statusCode == 200 else {
        await MainActor.run { [weak self] in
          self?.syncState.connectionTestRunning = false
          self?.syncState.connectionTestResult = "❌ Server unreachable"
        }
        return
      }
      // Step 2: /v1/devices (auth check)
      var devicesReq = URLRequest(url: baseURL.appendingPathComponent("v1/devices"))
      devicesReq.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      devicesReq.timeoutInterval = 8
      let result: String
      if let (data, devResp) = try? await URLSession.shared.data(for: devicesReq),
         let http = devResp as? HTTPURLResponse {
        if http.statusCode == 200,
           let devs = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
          result = "✅ Connected · \(devs.count) device\(devs.count == 1 ? "" : "s")"
        } else if http.statusCode == 401 || http.statusCode == 403 {
          result = "⚠️ Server reachable · Auth failed (\(http.statusCode))"
        } else {
          result = "⚠️ Server reachable · Devices error (\(http.statusCode))"
        }
      } else {
        result = "⚠️ Server reachable · Auth check failed"
      }
      await MainActor.run { [weak self] in
        self?.syncState.connectionTestRunning = false
        self?.syncState.connectionTestResult = result
        self?.syncState.serverReachable = result.hasPrefix("✅") || result.hasPrefix("⚠️")
      }
    }
  }

  // Explicit health check — always runs regardless of session state.
  // Called after user saves server settings.
  func checkServerHealth() {
    let serverURLString = UserDefaults.standard.string(forKey: RemoteServerStorage.serverURL) ?? ""
    guard !serverURLString.isEmpty else { return }
    GooseAppModel._didRunHealthCheck = true
    Task { @MainActor in self.syncState.serverReachable = nil }
    runHealthCheck(serverURLString: serverURLString)
  }

  // Runs the GET /healthz check once per app session when upload is enabled
  // and a server URL is configured. Result is published via serverReachable.
  func triggerHealthCheckIfNeeded() {
    guard !GooseAppModel._didRunHealthCheck else { return }
    let uploadEnabled = UserDefaults.standard.bool(forKey: RemoteServerStorage.uploadEnabled)
    let serverURLString = UserDefaults.standard.string(forKey: RemoteServerStorage.serverURL) ?? ""
    guard uploadEnabled, !serverURLString.isEmpty else { return }
    GooseAppModel._didRunHealthCheck = true
    runHealthCheck(serverURLString: serverURLString)
  }

  private func runHealthCheck(serverURLString: String) {
    DispatchQueue.global(qos: .utility).async { [weak self] in
      guard let self else { return }
      guard let url = URL(string: serverURLString + "/healthz") else {
        Task { @MainActor in self.syncState.serverReachable = false }
        return
      }
      var request = URLRequest(url: url)
      request.timeoutInterval = 5
      let semaphore = DispatchSemaphore(value: 0)
      var isReachable = false
      var taskError: String?
      URLSession.shared.dataTask(with: request) { _, response, error in
        if let error {
          taskError = error.localizedDescription
        }
        isReachable = (response as? HTTPURLResponse)?.statusCode == 200
        semaphore.signal()
      }.resume()
      semaphore.wait()
      let logBody = taskError.map { "error=\($0)" } ?? "reachable=\(isReachable)"
      let logTitle = taskError != nil ? "healthz.error" : "healthz"
      Task { @MainActor [weak self] in
        self?.ble.record(level: .debug, source: "upload.health", title: logTitle, body: logBody)
      }

      Task { @MainActor in self.syncState.serverReachable = isReachable }
    }
  }
}
