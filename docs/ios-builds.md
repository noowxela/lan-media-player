# iOS device builds

Run from the project folder. Phone unlocked and plugged in over USB.

**Development** — debug app, talks to Metro (live JS reload):

```bash
npx expo run:ios --device
```

**Local Release** — JS bundled in, no Metro. USB install only, not App Store:

```bash
npx expo run:ios --device --configuration Release
```

Keep Metro running only for the development command. After JS-only LAN HTML changes on a dev build: reload the app, Stop sharing → Start sharing, then refresh the browser.

## Home Screen widget

After a **native** rebuild (`npx expo run:ios --device`), add **Now Playing**:

1. Long-press the Home Screen → **Edit** / **+**
2. Search **Music Player**
3. Add **Now Playing** (small or medium)

The widget can appear in the Home Screen gallery after a native rebuild. **Live track updates need a paid Apple Developer account** ($99/year). A free Apple ID cannot sign **App Groups** or **Push Notifications**, and expo-widgets uses an App Group to pass now-playing data to the widget.

This repo strips those entitlements via `plugins/with-personal-team-signing.js` so device installs still work. Remove that plugin after you enroll in the Apple Developer Program if you want the widget to show the current track.

## Linker error: `RCTPackagerConnection`

A Debug install can fail with `Undefined symbols: _OBJC_CLASS_$_RCTPackagerConnection` if the **Release** prebuilt React Native core is still in `ios/Pods`. That often happens after a Release device build, then `pod install`.

From `ios/Pods`:

```bash
printf 'Release' > React-Core-prebuilt/.last_build_configuration
node ../../node_modules/react-native/scripts/replace-rncore-version.js -c Debug -r 0.86.3 -p "$(pwd)"
```

Then run `npx expo run:ios --device` again.

