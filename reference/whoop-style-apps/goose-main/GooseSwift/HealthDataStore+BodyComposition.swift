import Foundation
import HealthKit

// MARK: - BodyCompositionRow

struct BodyCompositionRow {
  let date: String
  let source: String
  let weightKg: Double?
  let bodyFatPct: Double?
  let muscleMassKg: Double?

  init?(from dict: [String: Any]) {
    guard let date = dict["date"] as? String else { return nil }
    self.date = date
    self.source = dict["source"] as? String ?? "manual"
    self.weightKg = dict["weight_kg"] as? Double
    self.bodyFatPct = dict["body_fat_pct"] as? Double
    self.muscleMassKg = dict["muscle_mass_kg"] as? Double
  }
}

// MARK: - HealthDataStore+BodyComposition

extension HealthDataStore {

  // BODY-02, BODY-03, D-06, F-04: Load last 7 days of body composition history.
  // Uses requestValueAsync (not requestAsync) because body_composition.history_between
  // returns a bare JSON array [[...]], not a wrapped object.
  func loadBodyCompositionHistory() async {
    let db = databasePath
    let end = Self.hkDateFormatter.string(from: Date())
    let start = Self.hkDateFormatter.string(from: Date().addingTimeInterval(-7 * 24 * 60 * 60))
    do {
      let raw = try await bridge.requestValueAsync(
        method: "body_composition.history_between",
        args: ["database_path": db, "start_date": start, "end_date": end]
      )
      let rows = raw as? [[String: Any]] ?? []
      self.bodyCompositionHistory = rows.compactMap { BodyCompositionRow(from: $0) }
    } catch {
      // Leave bodyCompositionHistory unchanged on transient bridge error.
    }
  }

  // BODY-02: Upsert a body composition entry. All numeric values must be validated
  // before this call; bridge always receives kg (D-04). Throws on bridge failure.
  func upsertBodyComposition(
    date: String,
    weightKg: Double?,
    bodyFatPct: Double?,
    muscleMassKg: Double?,
    source: String
  ) async throws {
    var args: [String: Any] = [
      "database_path": databasePath,
      "date": date,
      "source": source,
    ]
    if let wkg = weightKg, wkg.isFinite && wkg > 0 {
      args["weight_kg"] = wkg
    }
    if let bf = bodyFatPct, bf.isFinite && bf >= 0 && bf <= 100 {
      args["body_fat_pct"] = bf
    }
    if let mm = muscleMassKg, mm.isFinite && mm > 0 {
      args["muscle_mass_kg"] = mm
    }
    _ = try await bridge.requestAsync(method: "body_composition.upsert", args: args)
    await loadBodyCompositionHistory()
  }

  // BODY-03, D-03, F-07, N-01, N-02, N-03: Import body composition samples from HealthKit.
  // Non-throwing — sets importState to communicate progress and errors to the UI.
  func importBodyCompositionFromHealthKit() async {
    self.importState = .importing

    guard HKHealthStore.isHealthDataAvailable() else {
      self.importState = .idle
      return
    }

    let store = HKHealthStore()

    var readTypes = Set<HKObjectType>()
    guard let bodyMassType = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
      self.importState = .idle
      return
    }
    guard let bodyFatType = HKQuantityType.quantityType(forIdentifier: .bodyFatPercentage) else {
      self.importState = .idle
      return
    }
    readTypes.insert(bodyMassType)
    readTypes.insert(bodyFatType)

    // Request read-only authorization (toShare: [] — this import is read-only, T-121-09).
    do {
      try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
        store.requestAuthorization(toShare: [], read: readTypes) { _, err in
          if let err {
            cont.resume(throwing: err)
          } else {
            cont.resume()
          }
        }
      }
    } catch {
      // Authorization denied or failed — return gracefully without crashing (T-121-03).
      self.importState = .idle
      return
    }

    do {
      let sortDesc = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

      // N-02: HKSampleQuery is ONE-SHOT — completion handler fires exactly once.
      // Use the canonical one-shot pattern: resume directly from the callback.
      // Do NOT use var accumulated + results==nil guard (that is HKAnchoredObjectQuery pattern).
      let weightSamples: [HKQuantitySample] = await withCheckedContinuation { cont in
        let q = HKSampleQuery(
          sampleType: bodyMassType,
          predicate: nil,
          limit: HKObjectQueryNoLimit,
          sortDescriptors: [sortDesc]
        ) { _, results, _ in
          cont.resume(returning: (results as? [HKQuantitySample]) ?? [])
        }
        store.execute(q)
      }

      // N-01: Continuation returns on @MainActor (whole function is @MainActor).
      // Upsert each sample on-actor — no MainActor.run wrapper needed.
      for sample in weightSamples {
        let date = Self.hkDateFormatter.string(from: sample.startDate)
        let kg = sample.quantity.doubleValue(for: HKUnit.gramUnit(with: .kilo))
        guard kg.isFinite && kg > 0 else { continue }
        try await upsertBodyComposition(
          date: date,
          weightKg: kg,
          bodyFatPct: nil,
          muscleMassKg: nil,
          source: "healthkit"
        )
      }

      // N-02: Same one-shot pattern for body fat percentage.
      let fatSamples: [HKQuantitySample] = await withCheckedContinuation { cont in
        let q = HKSampleQuery(
          sampleType: bodyFatType,
          predicate: nil,
          limit: HKObjectQueryNoLimit,
          sortDescriptors: [sortDesc]
        ) { _, results, _ in
          cont.resume(returning: (results as? [HKQuantitySample]) ?? [])
        }
        store.execute(q)
      }

      // T-121-02: Guard HK fraction in 0.0–1.0 before multiplying; multiply by 100
      // to convert from HealthKit fraction to percentage expected by the bridge.
      for sample in fatSamples {
        let value = sample.quantity.doubleValue(for: HKUnit.percent())
        guard value >= 0.0 && value <= 1.0 else { continue }
        let pct = value * 100.0
        let date = Self.hkDateFormatter.string(from: sample.startDate)
        try await upsertBodyComposition(
          date: date,
          weightKg: nil,
          bodyFatPct: pct,
          muscleMassKg: nil,
          source: "healthkit"
        )
      }

      await loadBodyCompositionHistory()
      self.importState = .idle

    } catch {
      // N-03: Import errors surface via importState — never silently swallowed (T-121-08).
      self.importState = .failed(error.localizedDescription)
    }
  }
}
