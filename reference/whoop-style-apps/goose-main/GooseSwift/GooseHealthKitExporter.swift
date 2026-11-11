#if canImport(HealthKit)
import Foundation
import HealthKit

// GooseHealthKitExporter — all HealthKit write logic for Goose biometric export.
//
// Entry points:
//   requestAuthorization() — call on first toggle-on (D-06)
//   exportAfterSleepSync() — call at end of syncBandSleepHistory() (D-01)
//
// Threading: all methods are safe to call from background Tasks.
// Do NOT call from @MainActor inline — HKHealthStore operations must not block the main thread.
//
// Error handling (D-11): every HKHealthStore.save() is wrapped in do/catch; errors are forwarded
// to the caller via the logError closure. Write failures are non-fatal — the app continues.
enum GooseHealthKitExporter {
  static let exportEnabledKey = "goose.healthkit.export.enabled"

  static var isExportEnabled: Bool {
    UserDefaults.standard.bool(forKey: exportEnabledKey)
  }

  // MARK: - Authorization (D-06)

  // Requests HealthKit write authorization for all four exported types.
  // Follows the same withCheckedThrowingContinuation pattern used in HealthKitFullImporter.swift.
  // Callers (D-07): on error, log via ble.record and revert the toggle.
  static func requestAuthorization() async throws {
    let store = HKHealthStore()
    let shareTypes: Set<HKSampleType> = [
      HKQuantityType(.heartRate),
      HKQuantityType(.heartRateVariabilitySDNN),
      HKQuantityType(.oxygenSaturation),
      HKCategoryType(.sleepAnalysis),
    ]
    try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
      store.requestAuthorization(toShare: shareTypes, read: []) { _, err in
        if let err { cont.resume(throwing: err) } else { cont.resume() }
      }
    }
  }

  // MARK: - Export entry point (D-01, D-04)

  // Called at the end of syncBandSleepHistory() after a successful sleep sync.
  // startTs / endTs are Unix seconds (same convention as overnightWindow() in GooseAppModel+SleepSync.swift).
  // logError receives (typeLabel, errorDescription) and is called by GooseAppModel which owns ble.record.
  static func exportAfterSleepSync(
    dbPath: String,
    deviceId: String,
    startTs: Double,
    endTs: Double,
    bridge: GooseRustBridge,
    logError: @escaping (String, String) -> Void
  ) async {
    guard isExportEnabled else { return }
    guard HKHealthStore.isHealthDataAvailable() else { return }
    let hkStore = HKHealthStore()
    await writeHeartRateSamples(
      hkStore: hkStore, bridge: bridge, dbPath: dbPath,
      deviceId: deviceId, startTs: startTs, endTs: endTs, logError: logError
    )
    await writeHRVSamples(
      hkStore: hkStore, bridge: bridge, dbPath: dbPath,
      startTs: startTs, endTs: endTs, logError: logError
    )
    await writeSpO2Samples(
      hkStore: hkStore, bridge: bridge, dbPath: dbPath,
      deviceId: deviceId, startTs: startTs, endTs: endTs, logError: logError
    )
    await writeSleepSessions(
      hkStore: hkStore, bridge: bridge, dbPath: dbPath,
      startTs: startTs, endTs: endTs, logError: logError
    )
  }

  // MARK: - Heart Rate (HK-01)

  // Reads HR samples from the Rust bridge (store.hk_hr_samples_between) and writes them to HK.
  // Each sample has: ts (Unix seconds), bpm (Int64).
  // HK unit: count/min — written as HKQuantity with start == end == sample timestamp.
  private static func writeHeartRateSamples(
    hkStore: HKHealthStore,
    bridge: GooseRustBridge,
    dbPath: String,
    deviceId: String,
    startTs: Double,
    endTs: Double,
    logError: @escaping (String, String) -> Void
  ) async {
    let result: [String: Any]
    do {
      result = try await bridge.requestAsync(
        method: "store.hk_hr_samples_between",
        args: [
          "database_path": dbPath,
          "device_id": deviceId,
          "start_unix_s": startTs,
          "end_unix_s": endTs,
        ]
      )
    } catch {
      logError("heartRate.bridge", "\(error)")
      return
    }
    guard let rows = result["rows"] as? [[String: Any]], !rows.isEmpty else { return }
    let hrType = HKQuantityType(.heartRate)
    let hrUnit = HKUnit.count().unitDivided(by: .minute())
    var samples: [HKObject] = []
    for row in rows {
      guard let ts = row["ts"] as? Double,
            let bpm = row["bpm"] as? Int64 ?? (row["bpm"] as? Int).map({ Int64($0) }) else {
        continue
      }
      let date = Date(timeIntervalSince1970: ts)
      let quantity = HKQuantity(unit: hrUnit, doubleValue: Double(bpm))
      let sample = HKQuantitySample(type: hrType, quantity: quantity, start: date, end: date)
      samples.append(sample)
    }
    guard !samples.isEmpty else { return }
    do {
      try await hkStore.save(samples)
    } catch {
      logError("heartRate", "\(error)")
    }
  }

  // MARK: - HRV (HK-02)

  // Reads HRV RMSSD from metrics.daily_recovery_metrics and writes to HK as heartRateVariabilitySDNN.
  //
  // Unit: HKUnit.secondUnit(with: .milli) — HealthKit's heartRateVariabilitySDNN type uses this unit
  // when both reading and writing RMSSD values; pass hrv_rmssd_ms directly without dividing by 1000.
  // (Confirmed: HealthKitFullImporter.swift line 219 reads with .secondUnit(with: .milli) directly.)
  //
  // Time range for each sample: start_time_unix_ms..end_time_unix_ms from the daily metric row.
  // Rows where hrv_rmssd_ms is nil or 0 are skipped.
  private static func writeHRVSamples(
    hkStore: HKHealthStore,
    bridge: GooseRustBridge,
    dbPath: String,
    startTs: Double,
    endTs: Double,
    logError: @escaping (String, String) -> Void
  ) async {
    let result: [String: Any]
    do {
      result = try await bridge.requestAsync(
        method: "metrics.daily_recovery_metrics",
        args: [
          "database_path": dbPath,
          "start_time_unix_ms": Int64(startTs * 1000),
          "end_time_unix_ms": Int64(endTs * 1000),
        ]
      )
    } catch {
      logError("hrv.bridge", "\(error)")
      return
    }
    guard let metrics = result["metrics"] as? [[String: Any]], !metrics.isEmpty else { return }
    let hrvType = HKQuantityType(.heartRateVariabilitySDNN)
    let hrvUnit = HKUnit.secondUnit(with: .milli)
    var samples: [HKObject] = []
    for metric in metrics {
      guard let rmssdMs = metric["hrv_rmssd_ms"] as? Double, rmssdMs > 0 else { continue }
      let startMs = metric["start_time_unix_ms"] as? Int64 ?? (metric["start_time_unix_ms"] as? Double).map { Int64($0) } ?? Int64(startTs * 1000)
      let endMs = metric["end_time_unix_ms"] as? Int64 ?? (metric["end_time_unix_ms"] as? Double).map { Int64($0) } ?? Int64(endTs * 1000)
      let sampleStart = Date(timeIntervalSince1970: Double(startMs) / 1000.0)
      let sampleEnd = Date(timeIntervalSince1970: Double(endMs) / 1000.0)
      let quantity = HKQuantity(unit: hrvUnit, doubleValue: rmssdMs)
      let sample = HKQuantitySample(
        type: hrvType, quantity: quantity, start: sampleStart, end: sampleEnd
      )
      samples.append(sample)
    }
    guard !samples.isEmpty else { return }
    do {
      try await hkStore.save(samples)
    } catch {
      logError("hrv", "\(error)")
    }
  }

  // MARK: - SpO2 (HK-03)

  // Reads SpO2 from store.hk_spo2_samples_between — returns pre-computed spo2_percent (0–100).
  // HK oxygenSaturation expects a fraction in [0.0, 1.0] — divide spo2_percent by 100 (T-97-07).
  // Samples outside valid range after conversion are skipped.
  private static func writeSpO2Samples(
    hkStore: HKHealthStore,
    bridge: GooseRustBridge,
    dbPath: String,
    deviceId: String,
    startTs: Double,
    endTs: Double,
    logError: @escaping (String, String) -> Void
  ) async {
    let result: [String: Any]
    do {
      result = try await bridge.requestAsync(
        method: "store.hk_spo2_samples_between",
        args: [
          "database_path": dbPath,
          "device_id": deviceId,
          "start_unix_s": startTs,
          "end_unix_s": endTs,
        ]
      )
    } catch {
      logError("oxygenSaturation.bridge", "\(error)")
      return
    }
    guard let rows = result["rows"] as? [[String: Any]], !rows.isEmpty else { return }
    let spo2Type = HKQuantityType(.oxygenSaturation)
    let spo2Unit = HKUnit.percent()
    var samples: [HKObject] = []
    for row in rows {
      guard let ts = row["ts"] as? Double,
            let spo2Percent = row["spo2_percent"] as? Double else { continue }
      // HK oxygenSaturation expects a fraction [0.0, 1.0]; skip out-of-range values (T-97-07)
      let fraction = spo2Percent / 100.0
      guard fraction >= 0.0 && fraction <= 1.0 else { continue }
      let date = Date(timeIntervalSince1970: ts)
      let quantity = HKQuantity(unit: spo2Unit, doubleValue: fraction)
      let sample = HKQuantitySample(type: spo2Type, quantity: quantity, start: date, end: date)
      samples.append(sample)
    }
    guard !samples.isEmpty else { return }
    do {
      try await hkStore.save(samples)
    } catch {
      logError("oxygenSaturation", "\(error)")
    }
  }

  // MARK: - Sleep (HK-04)

  // Reads sleep sessions from store.hk_sleep_sessions_between and writes as HKCategorySamples.
  // Uses .asleepUnspecified — correct for iOS 16+ multi-stage sleep compatibility (non-deprecated).
  // start_time_unix_ms and end_time_unix_ms from bridge rows are in milliseconds.
  private static func writeSleepSessions(
    hkStore: HKHealthStore,
    bridge: GooseRustBridge,
    dbPath: String,
    startTs: Double,
    endTs: Double,
    logError: @escaping (String, String) -> Void
  ) async {
    let result: [String: Any]
    do {
      result = try await bridge.requestAsync(
        method: "store.hk_sleep_sessions_between",
        args: [
          "database_path": dbPath,
          "start_unix_ms": Int64(startTs * 1000),
          "end_unix_ms": Int64(endTs * 1000),
        ]
      )
    } catch {
      logError("sleepAnalysis.bridge", "\(error)")
      return
    }
    guard let rows = result["rows"] as? [[String: Any]], !rows.isEmpty else { return }
    let sleepType = HKCategoryType(.sleepAnalysis)
    var samples: [HKObject] = []
    for row in rows {
      guard
        let startMs = row["start_time_unix_ms"] as? Int64 ?? (row["start_time_unix_ms"] as? Double).map({ Int64($0) }),
        let endMs = row["end_time_unix_ms"] as? Int64 ?? (row["end_time_unix_ms"] as? Double).map({ Int64($0) }),
        endMs > startMs
      else { continue }
      let sampleStart = Date(timeIntervalSince1970: Double(startMs) / 1000.0)
      let sampleEnd = Date(timeIntervalSince1970: Double(endMs) / 1000.0)
      let sample = HKCategorySample(
        type: sleepType,
        value: HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
        start: sampleStart,
        end: sampleEnd
      )
      samples.append(sample)
    }
    guard !samples.isEmpty else { return }
    do {
      try await hkStore.save(samples)
    } catch {
      logError("sleepAnalysis", "\(error)")
    }
  }
}
#endif
