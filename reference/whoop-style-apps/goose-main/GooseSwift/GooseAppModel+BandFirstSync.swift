import Foundation
import BackgroundTasks


extension GooseAppModel {
  // UserDefaults key for the last successful historical BLE sync timestamp.
  // Written BEFORE the BLE call to prevent retry loops on drop+reconnect.
  static let lastHistorySyncAtKey = "goose.swift.lastHistorySyncAt"

  // Cooldown between foreground historical syncs: 30 minutes.
  // A kill+restart within this window does not trigger a redundant sync.
  static let bandFirstSyncCooldown: TimeInterval = 30 * 60

  // Called from handleAppLifecycleChange when phase == "active".
  // Fires only if already connected (D-07: no reconnect attempt from this path).
  // Skips if a sync completed within the last 30 minutes (D-09/D-10).
  func triggerForegroundBLESync() {
    guard ble.connectionState == "ready" else { return }
    if let lastSync = UserDefaults.standard.object(forKey: Self.lastHistorySyncAtKey) as? Date,
       Date().timeIntervalSince(lastSync) < Self.bandFirstSyncCooldown {
      ble.record(
        source: "band_first_sync",
        title: "foreground_sync.skipped",
        body: "foreground sync skipped — last sync within 30 min"
      )
      return
    }
    // Write BEFORE the BLE call to prevent retry loops on drop+reconnect (per SleepSync pattern).
    UserDefaults.standard.set(Date(), forKey: Self.lastHistorySyncAtKey)
    ble.record(source: "band_first_sync", title: "foreground_sync.start")
    ble.syncHistoricalPackets(rangeFirst: true)
  }

  // BGAppRefreshTask handler. Registered in GooseSwiftApp.init() for identifier
  // "com.goose.swift.bg-sync". The handler receives the task on an arbitrary thread;
  // GooseSwiftApp dispatches it to @MainActor before calling this method.
  func handleBGAppRefresh(task: BGAppRefreshTask) {
    // Reschedule next wakeup immediately — iOS requires this before setTaskCompleted (D-12).
    scheduleNextBGAppRefresh()

    // Set expiration handler before starting any work (D-14: graceful OS revocation).
    task.expirationHandler = { [weak self] in
      if let self { Task { await self.bleCoordinator.stopScan() } }
      task.setTaskCompleted(success: false)
    }

    // If already connected, sync data immediately with a 20-second completion window.
    if ble.connectionState == "ready" {
      ble.syncHistoricalPackets(rangeFirst: true)
      DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
        task.setTaskCompleted(success: true)
      }
      return
    }

    // Otherwise attempt a scan+connect with a 20-second timeout (D-12/D-13).
    Task { await bleCoordinator.startScan() }
    DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
      if let self { Task { await self.bleCoordinator.stopScan() } }
      task.setTaskCompleted(success: false)
    }
  }

  // Submits the next BGAppRefreshTask request. Called both from the handler (mandatory)
  // and from .onAppear in GooseSwiftApp (first scheduling at app launch).
  func scheduleNextBGAppRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: "com.goose.swift.bg-sync")
    // iOS enforces a minimum of ~15 minutes; practical value ~30 min (Claude's discretion per CONTEXT.md).
    request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
    try? BGTaskScheduler.shared.submit(request)
  }
}
