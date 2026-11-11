import Foundation


enum WatermarkType {
  case rawFrames
  case decodedStreams
}

enum GooseUploadWatermark {
  // UserDefaults keys — dot-namespaced reverse-DNS, one per upload type.
  // Raw frames and decoded streams can fail independently and MUST NOT share a key
  // (a decoded-stream success must never advance the raw-frames watermark).
  static let rawFramesKey = "goose.swift.upload.rawFramesWatermark"
  static let decodedStreamsKey = "goose.swift.upload.decodedStreamsWatermark"

  // Returns the last confirmed upload timestamp for the given type.
  // Returns nil when no upload has been confirmed yet (first launch, after clearAllWatermarks).
  static func watermark(for type: WatermarkType) -> Date? {
    return UserDefaults.standard.object(forKey: key(for: type)) as? Date
  }

  // Advances the watermark for the given type to `date`.
  // Must be called ONLY inside an upload-success (2xx) branch — never on failure or timeout.
  static func update(_ type: WatermarkType, to date: Date) {
    UserDefaults.standard.set(date, forKey: key(for: type))
  }

  // Removes both watermark keys. Call on logout or device swap so the next upload
  // cycle starts from a full-history fallback rather than an outdated watermark.
  static func clearAllWatermarks() {
    UserDefaults.standard.removeObject(forKey: rawFramesKey)
    UserDefaults.standard.removeObject(forKey: decodedStreamsKey)
  }

  // Single source of truth: maps each WatermarkType case to its UserDefaults key.
  private static func key(for type: WatermarkType) -> String {
    switch type {
    case .rawFrames:     return rawFramesKey
    case .decodedStreams: return decodedStreamsKey
    }
  }
}
