import Darwin
import Foundation
import SwiftUI
import UIKit

#if DEBUG
struct HealthPreviewRouteHost: View {
  let route: HealthRoute
  let state: HealthPreviewState

  var body: some View {
    let previewStore = HealthDataStore()
    previewStore.applyPreviewState(state)
    return NavigationStack {
      HealthRouteDetailView(route: route)
    }
    .environment(GooseAppModel(startBLE: false))
    .environment(previewStore)
    .environmentObject(AppRouter())
  }
}
#endif

#Preview("Health Landing") {
  NavigationStack {
    HealthView()
  }
  .environment(GooseAppModel(startBLE: false))
  .environment(HealthDataStore())
}

#if DEBUG
#Preview("Health Monitor - Populated") {
  HealthPreviewRouteHost(route: .healthMonitor, state: .populated)
}

#Preview("Health Monitor - Missing Vitals") {
  HealthPreviewRouteHost(route: .healthMonitor, state: .missing)
}

#Preview("Sleep - Populated") {
  HealthPreviewRouteHost(route: .sleep, state: .populated)
}

#Preview("Sleep - Missing Sleep Data") {
  HealthPreviewRouteHost(route: .sleep, state: .missing)
}

#Preview("Recovery - Populated") {
  HealthPreviewRouteHost(route: .recovery, state: .populated)
}

#Preview("Recovery - Missing Vitals") {
  HealthPreviewRouteHost(route: .recovery, state: .missing)
}

#Preview("Strain - Populated") {
  HealthPreviewRouteHost(route: .strain, state: .populated)
}

#Preview("Strain - Missing Activities") {
  HealthPreviewRouteHost(route: .strain, state: .missing)
}

#Preview("Stress - Populated") {
  HealthPreviewRouteHost(route: .stress, state: .populated)
}

#Preview("Stress - Missing Time Series") {
  HealthPreviewRouteHost(route: .stress, state: .missing)
}

#Preview("Cardio Load - Populated") {
  HealthPreviewRouteHost(route: .cardioLoad, state: .populated)
}

#Preview("Cardio Load - Missing Inputs") {
  HealthPreviewRouteHost(route: .cardioLoad, state: .missing)
}

#Preview("Energy Bank - Populated") {
  HealthPreviewRouteHost(route: .energyBank, state: .populated)
}

#Preview("Energy Bank - Missing Inputs") {
  HealthPreviewRouteHost(route: .energyBank, state: .missing)
}

#Preview("Packet Inputs - Populated") {
  HealthPreviewRouteHost(route: .packetInputs, state: .populated)
}

#Preview("Packet Inputs - Missing") {
  HealthPreviewRouteHost(route: .packetInputs, state: .missing)
}

#Preview("Algorithms - Populated") {
  HealthPreviewRouteHost(route: .algorithms, state: .populated)
}

#Preview("Algorithms - Missing Catalog") {
  HealthPreviewRouteHost(route: .algorithms, state: .missing)
}

#Preview("Reference Comparisons - Populated") {
  HealthPreviewRouteHost(route: .referenceComparisons, state: .populated)
}

#Preview("Reference Comparisons - Missing") {
  HealthPreviewRouteHost(route: .referenceComparisons, state: .missing)
}

#Preview("Calibration - Populated") {
  HealthPreviewRouteHost(route: .calibration, state: .populated)
}

// MARK: - PREV-01: Home / Coach / More previews

#Preview("Home — Disconnected") {
  NavigationStack {
    HomeDashboardView(
      selectedDate: .constant(Date()),
      openHealthRoute: { _ in }
    )
  }
  .environment(GooseAppModel(startBLE: false))
  .environment(HealthDataStore())
  .environmentObject(AppRouter())
}

#Preview("Home — Populated") {
  NavigationStack {
    HomeDashboardView(
      selectedDate: .constant(Date()),
      openHealthRoute: { _ in }
    )
  }
  .environment(GooseAppModel(startBLE: false))
  .environment(HealthDataStore())
  .environmentObject(AppRouter())
}

#Preview("More — Default") {
  NavigationStack {
    MoreView()
  }
  .environment(GooseAppModel(startBLE: false))
  .environment(HealthDataStore())
  .environmentObject(AppRouter())
}

#Preview("Calibration - Missing") {
  HealthPreviewRouteHost(route: .calibration, state: .missing)
}

#endif
