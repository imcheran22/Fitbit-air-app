const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

// The iOS 27 SDK refuses to launch an app that hasn't adopted the UIScene life
// cycle ("UIScene life cycle is required for apps built with this SDK", a
// SIGTRAP in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
// Neither React Native (through 0.87) nor Expo (through SDK 57) ships scene
// support yet, so the app has to adopt it itself until the official fix lands
// upstream (tracked at https://github.com/expo/expo/issues/46664).
//
// Declaring UIApplicationSceneManifest alone is NOT enough: UIKit then creates
// the scene and the process survives, but the window AppDelegate builds with
// UIWindow(frame: UIScreen.main.bounds) is never attached to that scene, so
// the app renders a black/blank screen instead of crashing. The window has to
// be created FROM the UIWindowScene, which means moving React Native's
// startup into a scene delegate.
//
// SceneDelegate is appended to AppDelegate.swift rather than added as its own
// file so no Xcode project (.pbxproj) surgery is needed -- it lands in the
// same module, which is what $(PRODUCT_MODULE_NAME).SceneDelegate below
// resolves against.
const MARKER = '// biometrics-scene-delegate';

const SCENE_DELEGATE = `
${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    // Keep AppDelegate.window pointing at the live window; code that reaches
    // for it (React Native included) predates scenes and still expects it to
    // be set.
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)

    // A deep link that cold-launches the app arrives in connectionOptions --
    // application(_:open:options:) is never called under the scene life
    // cycle. expo-dev-client relies on this to receive its Metro URL, and our
    // own OAuth callback deep link (biometrics://health/callback) needs it too.
    for context in connectionOptions.urlContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      RCTLinkingManager.application(
        UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

// The window is now built by SceneDelegate, so didFinishLaunchingWithOptions
// only keeps the launch options around for it to use.
//
// These are matched separately rather than as one block: other config
// plugins can inject their own lines between them, and that injected code
// still has to run at didFinishLaunching time, not get swallowed by this
// replacement.
const WINDOW_RE = /^[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\r?\n/m;
const START_RN_RE = /^[ \t]*factory\.startReactNative\(\r?\n[\s\S]*?launchOptions: launchOptions\)\r?\n/m;

const NEW_WINDOW_LINE = `    // Window creation and startReactNative moved to SceneDelegate -- under
    // the UIScene life cycle the window must be created from the UIWindowScene.
    self.launchOptions = launchOptions
`;

const withSceneAppDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    let contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) {
      return cfg;
    }

    for (const [re, what] of [
      [WINDOW_RE, 'window creation'],
      [START_RN_RE, 'startReactNative call'],
    ]) {
      if (!re.test(contents)) {
        throw new Error(
          `with-ios-scene-delegate: AppDelegate.swift does not contain the expected ${what}; ` +
            'the Expo template changed and this plugin needs updating',
        );
      }
    }
    contents = contents.replace(WINDOW_RE, NEW_WINDOW_LINE).replace(START_RN_RE, '');

    // SceneDelegate reads these back off the AppDelegate.
    const anchor = '  var window: UIWindow?\n';
    if (!contents.includes(anchor)) {
      throw new Error("with-ios-scene-delegate: could not find AppDelegate's window property");
    }
    contents = contents.replace(anchor, anchor + '  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n');

    cfg.modResults.contents = contents + SCENE_DELEGATE;
    return cfg;
  });

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

module.exports = (config) => withSceneManifest(withSceneAppDelegate(config));
