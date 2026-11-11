import Foundation
import SwiftUI

struct BodyCompositionEntrySheet: View {
  @Environment(HealthDataStore.self) private var healthStore
  @Environment(\.dismiss) private var dismiss
  @AppStorage(OnboardingStorage.unitSystem) private var unitSystemRaw = MoreProfileUnitSystem.imperial.rawValue
  @State private var weightText: String = ""
  @State private var bodyFatText: String = ""
  @State private var muscleMassText: String = ""
  @State private var isSaving: Bool = false
  @State private var errorMessage: String? = nil

  // D-04, F-02: Use stored UnitSystem preference — do NOT use Locale.current.measurementSystem.
  private var unitSystem: MoreProfileUnitSystem {
    MoreProfileUnitSystem(rawValue: unitSystemRaw) ?? .imperial
  }
  private var isMetric: Bool { unitSystem == .metric }
  private var weightUnitLabel: String { isMetric ? "kg" : "lbs" }

  private var weightIsValid: Bool {
    guard let v = Double(weightText) else { return false }
    return v > 0
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Weight") {
          TextField(weightUnitLabel, text: $weightText)
            .keyboardType(.decimalPad)
        }

        Section("Body Fat % (optional)") {
          TextField("%", text: $bodyFatText)
            .keyboardType(.decimalPad)
        }

        Section("Muscle Mass kg (optional)") {
          TextField("kg", text: $muscleMassText)
            .keyboardType(.decimalPad)
        }

        if let msg = errorMessage {
          Section {
            Text(msg)
              .foregroundStyle(.red)
          }
        }
      }
      .navigationTitle("Log Body Composition")
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") {
            dismiss()
          }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Confirm") {
            confirmTapped()
          }
          .disabled(!weightIsValid || isSaving)
        }
      }
    }
  }

  private func confirmTapped() {
    // D-04: Parse weight and convert to kg if imperial. Bridge always receives kg.
    guard let parsedWeight = Double(weightText), parsedWeight > 0 else { return }
    let kg: Double = isMetric ? parsedWeight : parsedWeight / 2.20462
    guard kg.isFinite && kg > 0 else { return }

    // Body fat % — already in percent (0–100), no conversion needed.
    let bf: Double?
    if let v = Double(bodyFatText), v.isFinite && v >= 0 && v < 100 {
      bf = v
    } else {
      bf = nil
    }

    // Muscle mass — always in kg.
    let mm: Double?
    if let v = Double(muscleMassText), v.isFinite && v > 0 {
      mm = v
    } else {
      mm = nil
    }

    isSaving = true

    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withFullDate]
    let todayISO = iso.string(from: Date())

    Task {
      do {
        try await healthStore.upsertBodyComposition(
          date: todayISO,
          weightKg: kg,
          bodyFatPct: bf,
          muscleMassKg: mm,
          source: "manual"
        )
        dismiss()
      } catch {
        errorMessage = "Save failed"
        isSaving = false
      }
    }
  }
}
