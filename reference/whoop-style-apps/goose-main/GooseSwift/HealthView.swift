import Darwin
import Foundation
import SwiftUI
import UIKit

struct HealthView: View {
  @Environment(GooseAppModel.self) private var model
  @Environment(HealthDataStore.self) private var healthStore
  @State private var cachedLandingSnapshots: [HealthMetricSnapshot] = []
  @State private var cachedVitalSnapshots: [HealthMetricSnapshot] = []
  @State private var bpmRefreshTask: Task<Void, Never>?
  @State private var showingManualWorkout = false

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 22) {
        HealthDashboardStatusHeader(
          catalogStatus: healthStore.catalogStatus,
          usesSampleData: healthStore.usesSampleData
        )

        HealthActivityOverviewSection(
          steps: healthStore.whoopStepsDisplayText(),
          activeEnergy: healthStore.whoopActiveCaloriesDisplayText(),
          stepsFreshness: healthStore.whoopStepsStatusText(),
          stepsSource: healthStore.whoopStepsSource(),
          activeEnergyFreshness: healthStore.whoopActiveCaloriesStatusText(),
          activeEnergySource: healthStore.whoopActiveCaloriesSource(),
          heartRateValue: liveHeartRateValue,
          heartRateStatus: liveHeartRateStatus,
          heartRateSource: liveHeartRateSource
        )

        HealthVitalsPreviewSection(snapshots: cachedVitalSnapshots)

        HealthBodyCompositionSection()

        HealthRouteShortcutSection(
          title: "Explore Health",
          snapshots: snapshots(for: [.trends, .stress, .cardioLoad, .energyBank])
        )
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 18)
    }
    .gooseScreenBackground()
    .navigationTitle("Health")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackground(.hidden, for: .navigationBar)
    .navigationDestination(for: HealthRoute.self) { route in
      HealthRouteContentView(route: route)
    }
    .toolbar {
      ToolbarItem(placement: .topBarLeading) {
        Button {
          showingManualWorkout = true
        } label: {
          Image(systemName: "figure.run.circle")
        }
        .accessibilityLabel("Log Workout")
      }
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          refreshDashboard()
        } label: {
          Image(systemName: "arrow.clockwise")
        }
        .accessibilityLabel("Refresh Health")
      }
    }
    .sheet(isPresented: $showingManualWorkout) {
      ManualWorkoutEntrySheet(bridge: healthStore.bridge, databasePath: healthStore.databasePath)
    }
    .onAppear {
      model.recordUIAction("page.opened", detail: "Health")
      Task {
        await healthStore.loadBridgeCatalogsIfNeeded()
        await healthStore.refreshHeartRateTimeline()
        await healthStore.loadBodyCompositionHistory()
      }
      refreshSnapshots()
    }
    .onChange(of: model.ble.liveHeartRateBPM) { _, _ in
      bpmRefreshTask?.cancel()
      bpmRefreshTask = Task {
        try? await Task.sleep(for: .milliseconds(500))
        if !Task.isCancelled { refreshSnapshots() }
      }
    }
    .onChange(of: healthStore.catalogStatus) { _, _ in
      refreshSnapshots()
    }
  }

  private func refreshSnapshots() {
    cachedLandingSnapshots = healthStore.landingSnapshots(
      liveHeartRateBPM: model.ble.liveHeartRateBPM,
      liveHeartRateSource: model.ble.liveHeartRateSource,
      liveHeartRateUpdatedAt: model.ble.liveHeartRateUpdatedAt
    )
    cachedVitalSnapshots = Array(healthStore.healthMonitorSnapshots().prefix(4))
  }

  private var liveHeartRateValue: String {
    guard let bpm = model.ble.liveHeartRateBPM else {
      return "--"
    }
    return "\(bpm) bpm"
  }

  private var liveHeartRateStatus: String {
    guard model.ble.liveHeartRateBPM != nil else {
      return healthStore.heartRateTimelineStatus
    }
    return HealthDataStore.relativeText(for: model.ble.liveHeartRateUpdatedAt) ?? "Live"
  }

  private var liveHeartRateSource: HealthDataSource {
    model.ble.liveHeartRateBPM == nil
      ? .unavailable("BLE heart-rate stream waiting")
      : .live(model.ble.liveHeartRateSource)
  }

  private func snapshots(for routes: [HealthRoute]) -> [HealthMetricSnapshot] {
    routes.compactMap { route in
      cachedLandingSnapshots.first { $0.route == route } ?? healthStore.snapshot(for: route)
    }
  }

  @MainActor
  private func refreshDashboard() {
    Task {
      await healthStore.refreshBridgeCatalogs()
      await healthStore.refreshHeartRateTimeline()
      healthStore.refreshPacketInputsIfNeeded()
    }
  }
}
