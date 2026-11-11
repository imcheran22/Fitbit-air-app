#if canImport(HealthKit)
import Foundation
import HealthKit

extension GooseAppModel {

  // Called by MoreView toggle onChange when newValue == true (D-09).
  // Requests HK write authorization for all four exported types.
  // On denial or error: reverts the toggle to false and logs via ble.record (D-07).
  func enableHealthKitExport() async {
    do {
      try await GooseHealthKitExporter.requestAuthorization()
      // requestAuthorization completes without throwing even when the user denies —
      // check the actual authorizationStatus for heartRate as a proxy (D-07).
      let hkStore = HKHealthStore()
      let status = hkStore.authorizationStatus(for: HKQuantityType(.heartRate))
      if status != .sharingAuthorized {
        // User denied — revert toggle (D-07).
        await MainActor.run {
          UserDefaults.standard.set(false, forKey: GooseHealthKitExporter.exportEnabledKey)
        }
        ble.record(
          level: .error,
          source: "healthkit",
          title: "HK export disabled",
          body: "Authorization denied by user"
        )
      }
    } catch {
      // System-level auth error — revert toggle (D-07).
      await MainActor.run {
        UserDefaults.standard.set(false, forKey: GooseHealthKitExporter.exportEnabledKey)
      }
      ble.record(
        level: .error,
        source: "healthkit",
        title: "HK auth error",
        body: "\(error)"
      )
    }
  }
}
#endif
