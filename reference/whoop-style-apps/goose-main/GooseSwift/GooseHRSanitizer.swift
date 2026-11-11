import Foundation


// HR spike filter matching WHOOP's WHPHeartRateDataSanitizer valid range.
// Physiologically impossible samples are rejected at the single BLE chokepoint
// (recordLiveHeartRate) before they reach any consumer. Thresholds are static let
// constants so every call site reads from one authoritative source.
struct GooseHRSanitizer {
  // Minimum valid heart rate accepted from the WHOOP strap.
  // Values at or below this boundary are considered noise or artefacts.
  static let minValidBPM = 25

  // Maximum valid heart rate accepted from the WHOOP strap.
  // Values at or above this boundary are considered noise or artefacts.
  static let maxValidBPM = 220

  // Closed range derived from the two threshold constants; avoids repeating
  // the bounds at every call site.
  static let validRange: ClosedRange<Int> = minValidBPM...maxValidBPM

  // Returns bpm unchanged when it falls within the valid physiological range,
  // or nil when the sample should be rejected as a spike artefact.
  // Pure and static — has no instance state and is safe to call from any thread.
  static func sanitize(_ bpm: Int) -> Int? {
    validRange.contains(bpm) ? bpm : nil
  }
}
