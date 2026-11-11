import Foundation

// GooseStealthMode — per-metric visibility preferences for Coach context.
//
// Purpose: Allow users to suppress individual biometric metrics from the Coach
// JSON context by replacing their values with a "hidden_by_user" sentinel.
// Phase 122 adds the toggle UI; this file delivers the data/logic layer only.
//
// Threading: All reads are from UserDefaults.standard.bool(forKey:) which is
// safe to call from any thread. GooseStealthMode is stateless.
// StealthMask is a value type and safe to pass across call sites freely.
//
// Three types in dependency order:
//   StealthStorage  — UserDefaults key constants (write path: Phase 122)
//   GooseStealthMode — query type; reads UserDefaults at call time
//   StealthMask     — value type; passed into CoachLocalToolContext.build()

// MARK: - StealthStorage

// Caseless enum used as a key namespace, following RemoteServerStorage convention.
// Keys follow the "goose.swift.*" project namespace established in RemoteServerPersistence.swift.
enum StealthStorage {
  static let recoveryScore = "goose.swift.stealth.recovery_score"
  static let strainScore   = "goose.swift.stealth.strain_score"
  static let hrvRmssd      = "goose.swift.stealth.hrv_rmssd"
  static let restingHr     = "goose.swift.stealth.resting_hr"
  static let sleepPerf     = "goose.swift.stealth.sleep_performance"
  static let stressScore   = "goose.swift.stealth.stress_score"
}

// MARK: - GooseStealthMode

// Query type for metric visibility. Reads UserDefaults.standard synchronously.
// Returns false for any unknown metric name — safe default, no crash path.
struct GooseStealthMode {
  static func isHidden(metric: String) -> Bool {
    let key = keyFor(metric: metric)
    guard !key.isEmpty else { return false }
    return UserDefaults.standard.bool(forKey: key)
  }

  private static func keyFor(metric: String) -> String {
    switch metric {
    case "recovery_score":    return StealthStorage.recoveryScore
    case "strain_score":      return StealthStorage.strainScore
    case "hrv_rmssd":         return StealthStorage.hrvRmssd
    case "resting_hr":        return StealthStorage.restingHr
    case "sleep_performance": return StealthStorage.sleepPerf
    case "stress_score":      return StealthStorage.stressScore
    default:                  return ""
    }
  }
}

// MARK: - StealthMask

// Value type carrying the set of metric keys (Coach-JSON-key form) that should
// be masked in CoachLocalToolContext output. Built at call sites in CoachChatModel
// from GooseStealthMode reads, translating storage-suffix keys to Coach JSON keys.
// StealthMask.none produces no masking and preserves existing build() behaviour.
struct StealthMask {
  let hidden: Set<String>

  func isHidden(_ metric: String) -> Bool {
    hidden.contains(metric)
  }

  static let none = StealthMask(hidden: [])
}
