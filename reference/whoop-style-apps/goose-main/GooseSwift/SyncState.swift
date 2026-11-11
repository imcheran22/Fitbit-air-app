import Foundation
import Observation

@MainActor @Observable
final class SyncState {
  var syncPendingRowCount: Int = 0
  var pendingBatchCount: Int = 0
  var lastSyncedCount: Int? = nil
  var serverImportInProgress: Bool = false
  var serverImportLastFrameCount: Int? = nil
  var lastUploadAt: Date? = nil
  var uploadErrorState: String? = nil
  var hasPendingUploadAfterReconnect: Bool = false
  var serverReachable: Bool? = nil
  var connectionTestRunning: Bool = false
  var connectionTestResult: String? = nil
  private(set) var isNetworkReachable: Bool = true
  var apnsDeviceToken: String? = nil

  func applyNetworkReachability(_ reachable: Bool) { isNetworkReachable = reachable }
}
