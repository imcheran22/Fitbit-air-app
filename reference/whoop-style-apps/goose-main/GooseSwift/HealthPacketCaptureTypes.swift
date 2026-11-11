import Foundation
import UIKit

enum HealthPacketCaptureMode: String {
  case walk
  case temperature
  case physiology
  case hrMonitor = "hr_monitor"

  var purpose: String {
    switch self {
    case .walk:
      return "walk_movement_hr_activity_detection"
    case .temperature:
      return "temperature_history_event_capture"
    case .physiology:
      return "full_physiology_signal_capture"
    case .hrMonitor:
      return "standard_gatt_hr_monitor_capture"
    }
  }

  var targetFamilies: [String] {
    switch self {
    case .walk:
      return [
        "raw_motion_k10",
        "raw_stream_k11",
        "embedded_heart_rate",
        "passive_activity_candidate",
        "gps_route_if_authorized",
      ]
    case .temperature:
      return [
        "temperature_event_17",
        "normal_history_k18",
        "normal_history_k24",
        "history_metadata",
      ]
    case .physiology:
      return [
        "realtime_status_k2",
        "raw_motion_k10",
        "raw_stream_k11",
        "embedded_heart_rate",
        "raw_or_research_k20",
        "r17_optical_or_labrador_filtered",
        "raw_motion_k21",
        "pulse_information_k25_k26",
        "temperature_candidates_if_present",
      ]
    case .hrMonitor:
      return ["embedded_heart_rate"]
    }
  }

  var initialTargetSummary: String {
    switch self {
    case .walk:
      return "frames 0 | motion 0 | K11 0 | R21 0 | optical 0 | pulse 0 | temp 0 | unknown 0"
    case .temperature:
      return "frames 0 | K18 0 | K24 0 | event17 0 | temp 0 | unknown 0"
    case .physiology:
      return "frames 0 | motion 0 | K11 0 | HR 0 | R21 0 | optical 0 | pulse 0 | temp 0 | unknown 0"
    case .hrMonitor:
      return "frames 0 | BPM 0 | RR 0"
    }
  }

  var statusPrefix: String {
    switch self {
    case .walk:
      return "Capturing walk packets"
    case .temperature:
      return "Capturing temperature history"
    case .physiology:
      return "Capturing physiology signals"
    case .hrMonitor:
      return "Capturing HR monitor"
    }
  }
}

struct DeviceSignalPoint: Identifiable, Equatable {
  let id = UUID()
  let capturedAt: Date
  let family: String
  let value: String
  let detail: String
}

struct ActiveHealthPacketCapture {
  let sessionID: String
  let startedAt: Date
  let mode: HealthPacketCaptureMode
  var importedFrameCount: Int
}

struct HealthPacketCaptureFamily: Identifiable, Equatable {
  let id: String
  let title: String
  var detail: String
  var count: Int
  var lastSeen: Date
  let status: HealthPacketCaptureFamilyStatus
}

struct HealthPacketCaptureFamilySnapshot {
  let rows: [HealthPacketCaptureFamily]
  let lastPacketSummary: String?
  let discoveredFamilies: [HealthPacketCaptureFamily]
  let queueDepth: Int
  let queueHighWatermark: Int
  let coalescedUpdateCount: Int
}

final class HealthPacketCaptureFamilyAggregator {
  var onSnapshot: ((HealthPacketCaptureFamilySnapshot) -> Void)?
  var onStatus: ((String) -> Void)?

  private let queue = DispatchQueue(label: "com.goose.swift.health-packet-family-aggregator", qos: .utility)
  private let stateLock = NSLock()
  private let publishInterval: TimeInterval
  private var rowsByID: [String: HealthPacketCaptureFamily] = [:]
  private var pendingLastPacketSummary: String?
  private var pendingDiscoveredFamilies: [HealthPacketCaptureFamily] = []
  private var coalescedUpdateCount = 0
  private var publishScheduled = false
  private var lastPublishedAt = Date.distantPast
  private var queuedOperationCount = 0
  private var queueHighWatermark = 0
  private var lastStatusEmittedAt = Date.distantPast
  private let statusInterval: TimeInterval = 5

  init(publishInterval: TimeInterval) {
    self.publishInterval = publishInterval
  }

  func reset() {
    queue.async { [weak self] in
      guard let self else {
        return
      }
      self.rowsByID.removeAll(keepingCapacity: true)
      self.pendingLastPacketSummary = nil
      self.pendingDiscoveredFamilies.removeAll(keepingCapacity: true)
      self.coalescedUpdateCount = 0
      self.publishScheduled = false
      self.lastPublishedAt = .distantPast
      self.resetQueueDepth()
    }
  }

  func record(_ family: HealthPacketCaptureFamily, capturedAt: Date) {
    let queued = incrementQueueDepth()
    emitStatusIfNeeded(label: "queued", depth: queued.depth, highWatermark: queued.highWatermark)
    queue.async { [weak self] in
      guard let self else {
        return
      }
      self.recordOnQueue(family, capturedAt: capturedAt)
      let completed = self.decrementQueueDepth()
      self.emitStatusIfNeeded(label: "completed", depth: completed.depth, highWatermark: completed.highWatermark)
    }
  }

  private func recordOnQueue(_ family: HealthPacketCaptureFamily, capturedAt: Date) {
    if var existing = rowsByID[family.id] {
      existing.count += 1
      existing.lastSeen = capturedAt
      existing.detail = family.detail
      rowsByID[family.id] = existing
      coalescedUpdateCount += 1
    } else {
      rowsByID[family.id] = family
      pendingDiscoveredFamilies.append(family)
    }

    pendingLastPacketSummary = "\(family.title) | \(family.detail)"
    schedulePublish(now: capturedAt)
  }

  private func schedulePublish(now: Date) {
    let elapsed = now.timeIntervalSince(lastPublishedAt)
    guard elapsed < publishInterval else {
      publish(now: now)
      return
    }
    guard !publishScheduled else {
      return
    }

    publishScheduled = true
    queue.asyncAfter(deadline: .now() + (publishInterval - elapsed)) { [weak self] in
      self?.publish(now: Date())
    }
  }

  private func publish(now: Date) {
    publishScheduled = false
    let rows = rowsByID.values.sorted { lhs, rhs in
      if lhs.status.sortRank != rhs.status.sortRank {
        return lhs.status.sortRank < rhs.status.sortRank
      }
      if lhs.count != rhs.count {
        return lhs.count > rhs.count
      }
      return lhs.lastSeen > rhs.lastSeen
    }
    let queueSnapshot = queueDepthSnapshot()
    let snapshot = HealthPacketCaptureFamilySnapshot(
      rows: rows,
      lastPacketSummary: pendingLastPacketSummary,
      discoveredFamilies: pendingDiscoveredFamilies,
      queueDepth: queueSnapshot.depth,
      queueHighWatermark: queueSnapshot.highWatermark,
      coalescedUpdateCount: coalescedUpdateCount
    )
    pendingLastPacketSummary = nil
    pendingDiscoveredFamilies.removeAll(keepingCapacity: true)
    coalescedUpdateCount = 0
    guard !snapshot.rows.isEmpty || snapshot.lastPacketSummary != nil || !snapshot.discoveredFamilies.isEmpty else {
      return
    }
    lastPublishedAt = now
    onSnapshot?(snapshot)
  }

  private func incrementQueueDepth() -> (depth: Int, highWatermark: Int) {
    stateLock.lock()
    queuedOperationCount += 1
    queueHighWatermark = max(queueHighWatermark, queuedOperationCount)
    let snapshot = (queuedOperationCount, queueHighWatermark)
    stateLock.unlock()
    return snapshot
  }

  private func decrementQueueDepth() -> (depth: Int, highWatermark: Int) {
    stateLock.lock()
    queuedOperationCount = max(0, queuedOperationCount - 1)
    let snapshot = (queuedOperationCount, queueHighWatermark)
    stateLock.unlock()
    return snapshot
  }

  private func resetQueueDepth() {
    stateLock.lock()
    queuedOperationCount = 0
    queueHighWatermark = 0
    lastStatusEmittedAt = .distantPast
    stateLock.unlock()
  }

  private func queueDepthSnapshot() -> (depth: Int, highWatermark: Int) {
    stateLock.lock()
    let snapshot = (queuedOperationCount, queueHighWatermark)
    stateLock.unlock()
    return snapshot
  }

  private func emitStatusIfNeeded(label: String, depth: Int, highWatermark: Int) {
    let now = Date()
    stateLock.lock()
    let shouldEmit = depth >= 8 || now.timeIntervalSince(lastStatusEmittedAt) >= statusInterval
    if shouldEmit {
      lastStatusEmittedAt = now
    }
    stateLock.unlock()
    guard shouldEmit else {
      return
    }
    onStatus?("capture family \(label) | familyQ \(depth) hwm \(highWatermark)")
  }
}

enum HealthPacketCaptureFamilyStatus: String {
  case target
  case expected
  case unresolved
  case unknown

  var sortRank: Int {
    switch self {
    case .target:
      return 0
    case .unresolved:
      return 1
    case .unknown:
      return 2
    case .expected:
      return 3
    }
  }
}
