import Foundation
import OSLog

private let logger = Logger(subsystem: "com.goose.swift", category: "realtime-pip-queue")

// THREADING: @unchecked Sendable is safe — all mutable state is protected by stateLock (NSLock);
// Rust bridge calls are made only from writeQueue (serial), never from the caller's thread.
// RealtimePIPQueue is fully isolated from CaptureFrameWriteQueue (D-02): own lock, own queue,
// own bridge instance, own backpressure accounting.
final class RealtimePIPQueue: @unchecked Sendable {
  private let writeQueue = DispatchQueue(label: "com.goose.swift.realtime-pip-write", qos: .utility)
  // THREADING: stateLock guards pendingRows, queuedRowCount, and isWriting
  // shared between BLE notification ingest callers (enqueue) and the writeQueue flush path.
  private let stateLock = NSLock()
  private let rust = GooseRustBridge()
  private let databasePath: String
  private let maxQueuedRows: Int
  private let maxBatchRows: Int
  private let coalesceDelay: TimeInterval
  private var pendingRows: [RealtimePIPFrame] = []
  private var queuedRowCount = 0
  private var isWriting = false

  init(databasePath: String, maxQueuedRows: Int, maxBatchRows: Int, coalesceDelay: TimeInterval) {
    self.databasePath = databasePath
    self.maxQueuedRows = maxQueuedRows
    self.maxBatchRows = max(1, maxBatchRows)
    self.coalesceDelay = max(0, coalesceDelay)
  }

  // Fire-and-forget: realtime frames are best-effort; no completion callback.
  // Applies same backpressure model as CaptureFrameWriteQueue: drops frames beyond maxQueuedRows
  // (D-02 / ROADMAP success criterion 3 — independent accounting from capture queue).
  func enqueue(frames: [RealtimePIPFrame]) {
    guard !frames.isEmpty else {
      return
    }

    var shouldStartWriter = false
    stateLock.lock()
    defer { stateLock.unlock() }

    let capacity = max(0, maxQueuedRows - queuedRowCount)
    guard capacity > 0 else {
      logger.debug("realtime-pip-queue: dropped \(frames.count) frame(s) — queue full (\(self.queuedRowCount)/\(self.maxQueuedRows))")
      return
    }

    let accepted = Array(frames.prefix(capacity))
    let dropped = frames.count - accepted.count
    if dropped > 0 {
      logger.debug("realtime-pip-queue: dropped \(dropped) frame(s) — queue at capacity")
    }
    queuedRowCount += accepted.count
    pendingRows.append(contentsOf: accepted)

    if !isWriting {
      isWriting = true
      shouldStartWriter = true
    }

    if shouldStartWriter {
      writeQueue.asyncAfter(deadline: .now() + coalesceDelay) { [weak self] in
        self?.flushNext()
      }
    }
  }

  private func flushNext() {
    while true {
      let batch: [RealtimePIPFrame]
      stateLock.lock()
      if pendingRows.isEmpty {
        isWriting = false
        stateLock.unlock()
        return
      }
      let rowCount = min(maxBatchRows, pendingRows.count)
      batch = Array(pendingRows.prefix(rowCount))
      pendingRows.removeFirst(rowCount)
      queuedRowCount = max(0, queuedRowCount - batch.count)
      stateLock.unlock()

      // Single-frame insert per batch iteration (D-02 args contract: one row per bridge call).
      // Errors are logged without crashing — realtime is best-effort.
      for frame in batch {
        do {
          _ = try rust.request(
            method: "realtime.insert_frame",
            args: [
              "database_path": databasePath,
              "device_uuid": frame.deviceUUID,
              "frame_hex": frame.frameHex,
              "captured_at": frame.capturedAt,
            ]
          )
        } catch {
          logger.error("realtime-pip-queue: realtime.insert_frame failed: \(String(describing: error))")
        }
      }
    }
  }
}

struct RealtimePIPFrame {
  let deviceUUID: String
  let frameHex: String
  let capturedAt: String
}
