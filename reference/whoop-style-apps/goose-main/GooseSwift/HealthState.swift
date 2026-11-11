import Foundation
import Observation

@MainActor @Observable
final class HealthState {
  // Health packet capture props
  var healthPacketCaptureSessionID: String? = nil
  var healthPacketCaptureStatus: String = "No health packet capture"
  var healthPacketCaptureStartedAt: Date? = nil
  var healthPacketCaptureFrameCount: Int = 0
  var healthPacketCaptureTargetSummary: String = "No health packet capture"
  var healthPacketCaptureLastPacketSummary: String = "No packets captured"
  var healthPacketCaptureFamilyRows: [HealthPacketCaptureFamily] = []

  // Respiratory packet watch props
  var respiratoryPacketWatchActive: Bool = false
  var respiratoryPacketWatchStatus: String = "Not watching K18 respiratory history"

  // Activity props
  var activityPersistenceStatus: String = "No activity stored"
  var homeActivityTimelineItems: [ActivityTimelineItem] = []
  var homeActivityTimelineStatus: String = "Activity timeline not loaded"
  var activityDetectionStatus: String = "Watching for movement packets"

  // Movement packet validation props
  var movementPacketValidationStatus: String = "Not run"
  var movementPacketValidationIsRunning: Bool = false

  // Packet import props
  var packetImportRevision: Int = 0
  var packetImportStatus: String = "No packet import"
}
