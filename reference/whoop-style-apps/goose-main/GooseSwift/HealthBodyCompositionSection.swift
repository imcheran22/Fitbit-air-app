import Foundation
import SwiftUI

// MARK: - WeightSparklineView

private struct WeightSparklineView: View {
  let points: [Double]  // weight_kg values, oldest-first, count >= 2
  let tint: Color

  var body: some View {
    GeometryReader { proxy in
      let plot = CGRect(x: 0, y: 4, width: proxy.size.width, height: proxy.size.height - 8)
      ZStack(alignment: .topLeading) {
        trendLine(in: plot)
          .stroke(tint, style: StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round))
        envelopePath(in: plot)
          .fill(tint.opacity(0.15))
      }
    }
  }

  // Computed domain with padding so the sparkline is never flush against edges.
  private var valueDomain: (min: Double, max: Double) {
    let lo = points.min()!
    let hi = points.max()!
    let padding = max((hi - lo) * 0.3, 0.5)
    return (min: lo - padding, max: hi + padding)
  }

  // F-05: CoreGraphics y=0 is at the TOP — invert so higher weight appears higher in the chart.
  private func chartPoint(index: Int, value: Double, plot: CGRect, domain: (min: Double, max: Double)) -> CGPoint {
    let normalized = (value - domain.min) / max(domain.max - domain.min, 0.001)
    let x = plot.minX + CGFloat(index) / CGFloat(max(points.count - 1, 1)) * plot.width
    let y = plot.maxY - CGFloat(normalized) * plot.height  // y=0 is TOP in CoreGraphics
    return CGPoint(x: x, y: y)
  }

  private func trendLine(in plot: CGRect) -> Path {
    let domain = valueDomain
    var path = Path()
    for (i, value) in points.enumerated() {
      let pt = chartPoint(index: i, value: value, plot: plot, domain: domain)
      if i == 0 {
        path.move(to: pt)
      } else {
        path.addLine(to: pt)
      }
    }
    return path
  }

  private func envelopePath(in plot: CGRect) -> Path {
    let domain = valueDomain
    let spread = max((domain.max - domain.min) * 0.08, 0.2)
    var path = Path()

    // Upper edge: left to right with value + spread
    for (i, value) in points.enumerated() {
      let pt = chartPoint(index: i, value: value + spread, plot: plot, domain: domain)
      if i == 0 {
        path.move(to: pt)
      } else {
        path.addLine(to: pt)
      }
    }

    // Lower edge: right to left with value - spread
    for (i, value) in points.enumerated().reversed() {
      let pt = chartPoint(index: i, value: value - spread, plot: plot, domain: domain)
      path.addLine(to: pt)
    }

    path.closeSubpath()
    return path
  }
}

// MARK: - HealthBodyCompositionSection

struct HealthBodyCompositionSection: View {
  @Environment(HealthDataStore.self) private var healthStore
  @AppStorage(OnboardingStorage.unitSystem) private var unitSystemRaw = MoreProfileUnitSystem.imperial.rawValue
  @State private var showingEntrySheet = false

  // D-04, F-02: Use stored UnitSystem preference — do NOT use Locale.current.measurementSystem.
  private var unitSystem: MoreProfileUnitSystem {
    MoreProfileUnitSystem(rawValue: unitSystemRaw) ?? .imperial
  }
  private var isMetric: Bool { unitSystem == .metric }
  private var weightUnitLabel: String { isMetric ? "kg" : "lbs" }

  // N-03: Import state is owned by the store, not local UI state.
  private var isImporting: Bool {
    if case .importing = healthStore.importState { return true }
    return false
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      // Header
      HStack {
        Image(systemName: "scalemass")
        Text("Body Composition")
          .font(.headline)
        Spacer()
      }

      // Last logged entry
      if let last = healthStore.bodyCompositionHistory.last {
        HStack {
          Text(displayWeight(last))
            .font(.title2.bold())
          Text(weightUnitLabel)
            .font(.subheadline)
            .foregroundStyle(.secondary)
          Spacer()
          Text(last.date)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        if let bf = last.bodyFatPct {
          Text(String(format: "Body fat: %.1f%%", bf))
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      } else {
        Text("No data logged yet")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }

      // D-05: CoreGraphics sparkline — NO import Charts. Hidden when fewer than 2 weight points.
      let weightPoints = healthStore.bodyCompositionHistory.compactMap { $0.weightKg }
      if weightPoints.count >= 2 {
        WeightSparklineView(points: weightPoints, tint: .blue)
          .frame(height: 56)
      }

      // Action buttons
      HStack(spacing: 12) {
        Button("Log") {
          showingEntrySheet = true
        }
        .buttonStyle(.bordered)

        Button("Import from Health") {
          Task {
            await healthStore.importBodyCompositionFromHealthKit()
          }
        }
        .buttonStyle(.bordered)
        .disabled(isImporting)
      }

      // N-03: Error state from store — never a local importError var.
      if case .failed(let message) = healthStore.importState {
        Text(message)
          .font(.caption)
          .foregroundStyle(.red)
      }
    }
    .padding(16)
    .healthDashboardSurface(tint: .blue, tintOpacity: 0.08)
    .sheet(isPresented: $showingEntrySheet) {
      BodyCompositionEntrySheet()
    }
  }

  // D-04: Convert kg to display units. Bridge always receives kg; display converts for imperial.
  private func displayWeight(_ row: BodyCompositionRow) -> String {
    let kg = row.weightKg ?? 0.0
    if isMetric {
      return String(format: "%.1f", kg)
    } else {
      return String(format: "%.1f", kg * 2.20462)
    }
  }
}
