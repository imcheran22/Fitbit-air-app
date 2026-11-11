import Foundation

enum GooseRustBridgeError: Error {
  case encodingFailed
  case nullResponse
  case malformedResponse
  case methodFailed(String)
}

struct GooseRustBridgeTiming {
  let method: String
  let methodElapsedMicroseconds: Int
  let requestEncodeMicroseconds: Int
  let ffiRoundTripMicroseconds: Int
  let responseDecodeMicroseconds: Int

  var boundaryMicroseconds: Int {
    requestEncodeMicroseconds + ffiRoundTripMicroseconds + responseDecodeMicroseconds
  }
}

// THREADING: goose_bridge_handle_json blocks the calling thread for the full Rust+SQLite round trip;
// never call request() from @MainActor. Each owner (GooseAppModel, HealthDataStore,
// OvernightSQLiteMirrorQueue, CaptureFrameWriteQueue) holds its own instance — the Rust side is stateless.
final class GooseRustBridge: @unchecked Sendable {
  // THREADING: lock serialises counter increments and _lastTiming writes; bridge instances may be
  // called concurrently from DispatchQueue.async or Task.detached contexts.
  private let lock = NSLock()
  private var counter = 0
  private var _lastTiming: GooseRustBridgeTiming?

  private(set) var lastTiming: GooseRustBridgeTiming? {
    get { lock.withLock { _lastTiming } }
    set { lock.withLock { _lastTiming = newValue } }
  }

  func request(method: String, args: [String: Any] = [:]) throws -> [String: Any] {
    try requestValue(method: method, args: args) as? [String: Any] ?? [:]
  }

  // THREADING: callers must dispatch to a background DispatchQueue before calling request() or
  // requestValue() — the call blocks until Rust + SQLite return, then resumes on the calling thread.
  func requestValue(method: String, args: [String: Any] = [:]) throws -> Any {
    let requestID: String = lock.withLock {
      _lastTiming = nil
      counter += 1
      return "goose-swift-\(Date().timeIntervalSince1970)-\(counter)"
    }
    let payload: [String: Any] = [
      "schema": "goose.bridge.request.v1",
      "request_id": requestID,
      "method": method,
      "args": args,
    ]
    let encodeStarted = DispatchTime.now()
    let data = try JSONSerialization.data(withJSONObject: payload)
    guard let request = String(data: data, encoding: .utf8) else {
      throw GooseRustBridgeError.encodingFailed
    }
    let requestEncodeMicroseconds = Self.elapsedMicroseconds(since: encodeStarted)

    var responsePointer: UnsafeMutablePointer<CChar>?
    let ffiStarted = DispatchTime.now()
    request.withCString { pointer in
      responsePointer = goose_bridge_handle_json(pointer)
    }
    let ffiRoundTripMicroseconds = Self.elapsedMicroseconds(since: ffiStarted)
    guard let responsePointer else {
      throw GooseRustBridgeError.nullResponse
    }
    defer {
      goose_bridge_free_string(responsePointer)
    }

    let responseDecodeStarted = DispatchTime.now()
    let responseText = String(cString: responsePointer)
    let responseData = Data(responseText.utf8)
    guard
      let response = try JSONSerialization.jsonObject(with: responseData) as? [String: Any],
      let ok = response["ok"] as? Bool
    else {
      throw GooseRustBridgeError.malformedResponse
    }
    let responseDecodeMicroseconds = Self.elapsedMicroseconds(since: responseDecodeStarted)
    lastTiming = Self.timing(
      from: response,
      requestEncodeMicroseconds: requestEncodeMicroseconds,
      ffiRoundTripMicroseconds: ffiRoundTripMicroseconds,
      responseDecodeMicroseconds: responseDecodeMicroseconds
    )
    if !ok {
      let error = response["error"] as? [String: Any]
      let message = error?["message"] as? String ?? "Rust bridge method failed"
      throw GooseRustBridgeError.methodFailed(message)
    }
    return response["result"] ?? [:]
  }

  func requestValueAsync(method: String, args: [String: Any] = [:]) async throws -> Any {
    try await Task.detached(priority: .userInitiated) { try self.requestValue(method: method, args: args) }.value
  }

  func requestAsync(method: String, args: [String: Any] = [:]) async throws -> [String: Any] {
    try await requestValueAsync(method: method, args: args) as? [String: Any] ?? [:]
  }

  private static func timing(
    from response: [String: Any],
    requestEncodeMicroseconds: Int,
    ffiRoundTripMicroseconds: Int,
    responseDecodeMicroseconds: Int
  ) -> GooseRustBridgeTiming? {
    guard let timing = response["timing"] as? [String: Any],
          let method = timing["method"] as? String else {
      return nil
    }
    if let elapsed = timing["method_elapsed_us"] as? Int {
      return GooseRustBridgeTiming(
        method: method,
        methodElapsedMicroseconds: elapsed,
        requestEncodeMicroseconds: requestEncodeMicroseconds,
        ffiRoundTripMicroseconds: ffiRoundTripMicroseconds,
        responseDecodeMicroseconds: responseDecodeMicroseconds
      )
    }
    if let elapsed = timing["method_elapsed_us"] as? Double {
      return GooseRustBridgeTiming(
        method: method,
        methodElapsedMicroseconds: Int(elapsed),
        requestEncodeMicroseconds: requestEncodeMicroseconds,
        ffiRoundTripMicroseconds: ffiRoundTripMicroseconds,
        responseDecodeMicroseconds: responseDecodeMicroseconds
      )
    }
    return nil
  }

  private static func elapsedMicroseconds(since started: DispatchTime) -> Int {
    let elapsedNanoseconds = DispatchTime.now().uptimeNanoseconds - started.uptimeNanoseconds
    let elapsedMicroseconds = elapsedNanoseconds / 1_000
    return Int(min(elapsedMicroseconds, UInt64(Int.max)))
  }
}
