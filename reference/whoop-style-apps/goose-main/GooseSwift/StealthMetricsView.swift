import SwiftUI

struct StealthMetricsView: View {
  @AppStorage(StealthStorage.recoveryScore) private var hideRecovery = false
  @AppStorage(StealthStorage.strainScore)   private var hideStrain = false
  @AppStorage(StealthStorage.hrvRmssd)      private var hideHRV = false
  @AppStorage(StealthStorage.restingHr)     private var hideRestingHR = false
  @AppStorage(StealthStorage.sleepPerf)     private var hideSleep = false
  @AppStorage(StealthStorage.stressScore)   private var hideStress = false

  var body: some View {
    // Stealth toggle persists immediately; dashboard re-renders on next HealthDataStore refresh cycle.
    List {
      Section {
        Toggle("Recovery Score", isOn: $hideRecovery)
        Toggle("Strain Score", isOn: $hideStrain)
        Toggle("HRV (RMSSD)", isOn: $hideHRV)
        Toggle("Resting HR", isOn: $hideRestingHR)
        Toggle("Sleep Performance", isOn: $hideSleep)
        Toggle("Stress Score", isOn: $hideStress)
      } footer: {
        Text("Hidden metrics show \u{2014} on the Health dashboard.")
      }
    }
    .listStyle(.insetGrouped)
    .gooseListBackground()
    .navigationTitle("Metrics Privacy")
    .navigationBarTitleDisplayMode(.inline)
  }
}

// MARK: - EnvironmentKey

struct StealthMaskKey: EnvironmentKey {
  static let defaultValue = StealthMask.none // Preview-only. Production code reads GooseStealthMode.isHidden(metric:) directly.
}

extension EnvironmentValues {
  var stealthMask: StealthMask {
    get { self[StealthMaskKey.self] }
    set { self[StealthMaskKey.self] = newValue }
  }
}

#Preview {
  StealthMetricsView()
    .environment(\.stealthMask, StealthMask(hidden: ["recovery_score"]))
}
