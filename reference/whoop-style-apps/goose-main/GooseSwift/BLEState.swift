import Foundation
import Observation

@MainActor @Observable
final class BLEState {
  var bondingState: GooseBLEBondingState = .notStarted
  var connectedDeviceGeneration: String? = nil
  var liveWorkoutStrain: Double = 0
  var heartRateHourlyRanges: [HeartRateHourlyRange] = []
  var heartRateStorageStatus: String = "No HR samples stored"
  var onboardingComplete: Bool = false
  var alarmIsArmed: Bool = false          // HAP-03
  var scheduledAlarmTime: Date? = nil     // HAP-03
  private(set) var hrSpikeCount: Int = 0

  func incrementHRSpikeCount() { hrSpikeCount += 1 }
}
