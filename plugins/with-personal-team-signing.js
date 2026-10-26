const { withEntitlementsPlist, withFinalizedMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const EMPTY_ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict/>
</plist>
`;

const SCENE_MANIFEST = `\t<key>UIApplicationSceneManifest</key>
\t<dict>
\t\t<key>UIApplicationSupportsMultipleScenes</key>
\t\t<false/>
\t\t<key>UISceneConfigurations</key>
\t\t<dict>
\t\t\t<key>UIWindowSceneSessionRoleApplication</key>
\t\t\t<array>
\t\t\t\t<dict>
\t\t\t\t\t<key>UISceneConfigurationName</key>
\t\t\t\t\t<string>Default Configuration</string>
\t\t\t\t\t<key>UISceneDelegateClassName</key>
\t\t\t\t\t<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>
\t\t\t\t</dict>
\t\t\t</array>
\t\t</dict>
\t</dict>
`;

const APP_DELEGATE_LAUNCH = `    reactNativeDelegate = delegate
    reactNativeFactory = factory
    self.launchOptions = launchOptions

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)`;

const APP_DELEGATE_LAUNCH_OLD = `    reactNativeDelegate = delegate
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)`;

const SCENE_DELEGATE = `
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
  }
}
`;

function stripPaidTeamCapabilities(entitlements) {
  if (!entitlements || typeof entitlements !== 'object') return entitlements;
  delete entitlements['aps-environment'];
  delete entitlements['com.apple.security.application-groups'];
  return entitlements;
}

function stripEntitlementsFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.writeFileSync(filePath, EMPTY_ENTITLEMENTS);
}

function ensureSceneLifecycle(platformRoot) {
  const infoPlist = path.join(platformRoot, 'MusicPlayer', 'Info.plist');
  if (fs.existsSync(infoPlist)) {
    const contents = fs.readFileSync(infoPlist, 'utf8');
    if (!contents.includes('UIApplicationSceneManifest')) {
      fs.writeFileSync(
        infoPlist,
        contents.replace(
          /(\s*)<key>UIBackgroundModes<\/key>/,
          `${SCENE_MANIFEST}$1<key>UIBackgroundModes</key>`
        )
      );
    }
  }

  const appDelegate = path.join(platformRoot, 'MusicPlayer', 'AppDelegate.swift');
  if (!fs.existsSync(appDelegate)) return;
  let source = fs.readFileSync(appDelegate, 'utf8');
  if (!source.includes('var launchOptions:')) {
    source = source.replace(
      'var reactNativeFactory: RCTReactNativeFactory?',
      'var reactNativeFactory: RCTReactNativeFactory?\n  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?'
    );
  }
  if (source.includes(APP_DELEGATE_LAUNCH_OLD)) {
    source = source.replace(APP_DELEGATE_LAUNCH_OLD, APP_DELEGATE_LAUNCH);
  }
  if (!source.includes('class SceneDelegate')) {
    source = source.replace(
      'class ReactNativeDelegate:',
      `${SCENE_DELEGATE}\nclass ReactNativeDelegate:`
    );
  }
  fs.writeFileSync(appDelegate, source);
}

/**
 * Personal (free) Apple IDs cannot sign Push Notifications or App Groups.
 * expo-widgets adds both after earlier entitlement mods, so strip the written
 * files in a finalized mod. A paid Apple Developer account is required for a
 * live Now Playing widget.
 *
 * iOS 27 also rejects an app that still creates its window in the AppDelegate.
 */
function withPersonalTeamSigning(config) {
  if (config.ios?.entitlements) {
    config.ios.entitlements = stripPaidTeamCapabilities({ ...config.ios.entitlements });
  }

  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults = stripPaidTeamCapabilities(mod.modResults);
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
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
    return mod;
  });

  return withFinalizedMod(config, [
    'ios',
    async (mod) => {
      const platformRoot = mod.modRequest.platformProjectRoot;
      stripEntitlementsFile(path.join(platformRoot, 'MusicPlayer', 'MusicPlayer.entitlements'));
      stripEntitlementsFile(
        path.join(platformRoot, 'ExpoWidgetsTarget', 'ExpoWidgetsTarget.entitlements')
      );
      ensureSceneLifecycle(platformRoot);
      return mod;
    },
  ]);
}

module.exports = withPersonalTeamSigning;
