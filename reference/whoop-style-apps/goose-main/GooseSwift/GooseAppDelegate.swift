import UIKit


final class GooseAppDelegate: NSObject, UIApplicationDelegate {
  // Buffer for the APNs device token when it arrives before sharedModel is set.
  // The iOS runtime may deliver didRegisterForRemoteNotificationsWithDeviceToken
  // before the first SwiftUI .onAppear fires (cold launch, cached token). This
  // static stores the token so GooseSwiftApp.onAppear can apply it immediately.
  nonisolated(unsafe) static var pendingAPNSToken: String?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    UIApplication.shared.registerForRemoteNotifications()
    return true
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    Task { @MainActor in
      if let model = GooseSwiftApp.sharedModel {
        model.setAPNSDeviceToken(hex)
      } else {
        // sharedModel not yet set — buffer the token. GooseSwiftApp.onAppear
        // will consume and apply it when the model becomes available.
        GooseAppDelegate.pendingAPNSToken = hex
      }
    }
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    // Expected on simulator and unprovisioned builds — soft failure; upload token gate
    // will keep uploads skipped (logged as skip.no_apns_token) until registration succeeds.
    Task { @MainActor in
      GooseSwiftApp.sharedModel?.ble.record(
        level: .warn,
        source: "app.apns",
        title: "register.failed",
        body: error.localizedDescription
      )
    }
  }
}
