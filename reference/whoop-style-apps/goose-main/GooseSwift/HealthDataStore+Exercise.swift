import Foundation
import SwiftUI

// MARK: - ExerciseSessionDisplayItem

struct ExerciseSessionDisplayItem: Identifiable {
  let id: String
  let startTs: Double
  let endTs: Double
  let durationSeconds: Double
  let avgHR: Double
  let peakHR: Double
  let strain: Double        // 0–21
  let caloriesKcal: Double
  let zoneTimePct: [String: Double]   // "z1"…"z5" → fraction 0–1
  let hmaxSource: String
  let rhrSource: String
}

extension ExerciseSessionDisplayItem {
  var startDate: Date { Date(timeIntervalSince1970: startTs) }
  var endDate: Date { Date(timeIntervalSince1970: endTs) }

  var startTimeLabel: String {
    startDate.formatted(.dateTime.hour(.twoDigits(amPM: .abbreviated)).minute())
  }

  var dateLabel: String {
    startDate.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
  }

  var durationText: String {
    let totalMinutes = Int((durationSeconds / 60).rounded())
    let h = totalMinutes / 60
    let m = totalMinutes % 60
    if h > 0 {
      return "\(h)h\(m)min"
    }
    return "\(m) min"
  }

  var caloriesText: String {
    caloriesKcal > 0 ? "\(Int(caloriesKcal.rounded())) kcal" : "--"
  }

  var strainText: String {
    String(format: "%.1f", strain)
  }

  var strainPercent: Double {
    min(max(strain / 21.0, 0), 1)
  }

  // Edwards zones sorted 1→5, filtered to non-zero fractions
  var zoneBreakdown: [(zone: String, label: String, fraction: Double)] {
    let order = [("z1", "Zona 1"), ("z2", "Zona 2"), ("z3", "Zona 3"), ("z4", "Zona 4"), ("z5", "Zona 5")]
    return order.compactMap { key, label in
      guard let fraction = zoneTimePct[key], fraction > 0 else { return nil }
      return (zone: key, label: label, fraction: fraction)
    }
  }
}

// MARK: - HealthDataStore+Exercise

extension HealthDataStore {
  // Fetches exercise sessions from the last 7 days via exercise.sessions_between.
  // Result is published on @MainActor.
  func runExerciseSessions() async {
    let db = databasePath
    let now = Date().timeIntervalSince1970
    let windowStart = now - 7 * 24 * 3600
    let deviceID = "goose.swift.exercise.sessions.v1"

    let asDouble: (Any?) -> Double? = { value in
      switch value {
      case let d as Double: return d
      case let f as Float: return Double(f)
      case let i as Int: return Double(i)
      case let n as NSNumber: return n.doubleValue
      default: return nil
      }
    }

    let report: [String: Any]
    do {
      report = try await bridge.requestAsync(
        method: "exercise.sessions_between",
        args: [
          "database_path": db,
          "device_id": deviceID,
          "ts_start": windowStart,
          "ts_end": now,
        ]
      )
    } catch {
      exerciseSessions = []
      return
    }

    let sessionRows = report["sessions"] as? [[String: Any]] ?? []
    let sessions: [ExerciseSessionDisplayItem] = sessionRows.enumerated().compactMap { index, row in
      guard let startTs = asDouble(row["start_ts"]),
            let endTs = asDouble(row["end_ts"]) else {
        return nil
      }
      // Decode zone_time_pct from JSON string (stored as serialized JSON).
      let zoneTimePct: [String: Double] = {
        if let jsonStr = row["zone_time_pct_json"] as? String,
           let data = jsonStr.data(using: .utf8),
           let decoded = try? JSONSerialization.jsonObject(with: data) as? [String: Double] {
          return decoded
        }
        return [:]
      }()
      return ExerciseSessionDisplayItem(
        id: "exercise-\(Int(startTs))-\(index)",
        startTs: startTs,
        endTs: endTs,
        durationSeconds: asDouble(row["duration_s"]) ?? endTs - startTs,
        avgHR: asDouble(row["avg_hr"]) ?? 0,
        peakHR: asDouble(row["peak_hr"]) ?? 0,
        strain: asDouble(row["strain"]) ?? 0,
        caloriesKcal: asDouble(row["calories_kcal"]) ?? 0,
        zoneTimePct: zoneTimePct,
        hmaxSource: row["hrmax_source"] as? String ?? "--",
        rhrSource: row["rhr_source"] as? String ?? "--"
      )
    }
    // Sort newest-first.
    exerciseSessions = sessions.sorted { $0.startTs > $1.startTs }
  }
}
