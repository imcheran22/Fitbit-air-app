import Foundation

@MainActor
final class PacketMonitorModel: ObservableObject {
  @Published private(set) var lastParsedFrameSummary = "No notification frames parsed"
  @Published private(set) var movementPacketStatus = "No movement packets"
  @Published private(set) var latestWhoopEventStatus = "No WHOOP events"
  @Published private(set) var latestSkinTemperatureCandidateStatus = "No skin temperature events"
  @Published private(set) var latestWhoopDataPacketStatus = "No WHOOP data packets"
  @Published private(set) var latestHistoryTemperatureCandidateStatus = "No history temperature packets"
  @Published private(set) var latestRespiratoryRateCandidateStatus = "No respiratory rate candidates"
  @Published private(set) var latestPulseInformationPacketStatus = "No pulse information packets"
  @Published private(set) var latestOpticalPacketStatus = "No optical packets"
  @Published private(set) var latestRawResearchPacketStatus = "No raw/research packets"
  @Published private(set) var latestRealtimeStatusPacketStatus = "No realtime status packets"
  @Published private(set) var performancePipelineStatus = "No pipeline samples"
  @Published private(set) var liveDeviceDataSummary = "No live WHOOP data points"
  @Published private(set) var recentDeviceSignalPoints: [DeviceSignalPoint] = []

  func apply(
    _ snapshot: PacketUIStateSnapshot,
    maxRecentDeviceSignalPoints: Int,
    publishInterval: TimeInterval
  ) {
    if let status = snapshot.lastParsedFrameSummary {
      lastParsedFrameSummary = status
    }
    if let status = snapshot.movementPacketStatus {
      movementPacketStatus = status
    }
    if let status = snapshot.whoopEventStatus {
      latestWhoopEventStatus = status
    }
    if let status = snapshot.skinTemperatureCandidateStatus {
      latestSkinTemperatureCandidateStatus = status
    }
    if let status = snapshot.whoopDataPacketStatus {
      latestWhoopDataPacketStatus = status
    }
    if let status = snapshot.historyTemperatureCandidateStatus {
      latestHistoryTemperatureCandidateStatus = status
    }
    if let status = snapshot.respiratoryRateCandidateStatus {
      latestRespiratoryRateCandidateStatus = status
    }
    if let status = snapshot.pulseInformationPacketStatus {
      latestPulseInformationPacketStatus = status
    }
    if let status = snapshot.opticalPacketStatus {
      latestOpticalPacketStatus = status
    }
    if let status = snapshot.rawResearchPacketStatus {
      latestRawResearchPacketStatus = status
    }
    if let status = snapshot.realtimeStatusPacketStatus {
      latestRealtimeStatusPacketStatus = status
    }
    if let status = snapshot.performancePipelineStatus {
      performancePipelineStatus = status
    }
    if !snapshot.deviceSignalPoints.isEmpty {
      for point in snapshot.deviceSignalPoints {
        recentDeviceSignalPoints.insert(point, at: 0)
      }
      if recentDeviceSignalPoints.count > maxRecentDeviceSignalPoints {
        recentDeviceSignalPoints.removeLast(recentDeviceSignalPoints.count - maxRecentDeviceSignalPoints)
      }
    }
    if let summary = snapshot.liveDeviceDataSummary {
      liveDeviceDataSummary = summary
    }
    if snapshot.coalescedStatusUpdateCount > 0 {
      let summary = snapshot.coalescedStatusUpdateSummary ?? "unknown"
      performancePipelineStatus = "ui coalesced \(snapshot.coalescedStatusUpdateCount) status update(s) before publish (\(summary); reason=publish_interval_\(publishInterval)s) | \(performancePipelineStatus)"
    }
    if snapshot.droppedDeviceSignalPointCount > 0 {
      performancePipelineStatus = "ui signal preview dropped \(snapshot.droppedDeviceSignalPointCount) stale point(s) | \(performancePipelineStatus)"
    }
  }
}
