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

## Certificate expired (reinstall on iPhone)

A free Apple ID signing certificate lasts about **7 days**. After that, iOS will not open the app. Rebuild and install over USB. This is not an App Store update.

Deleting the app also deletes the music stored inside it.

### On the iPhone

1. Delete **Music Player** if it is still on the Home Screen (long-press → Remove App).
2. Unlock the phone and leave it unlocked.
3. Plug it into the Mac with a cable. Tap **Trust** if the phone asks.
4. If iOS asks for Developer Mode: **Settings → Privacy & Security → Developer Mode → On**, then restart the phone.

### On the Mac

1. Open Xcode → **Settings → Accounts**. The same Apple ID used last time must be signed in. If it is missing, click **+** and sign in.
2. From the project folder:

```bash
npx expo run:ios --device --configuration Release
```

3. When asked which device, pick the iPhone. The first build can take several minutes.

`--configuration Release` bundles the JavaScript in the app, so the phone works after you unplug it. For live reload while coding, use `npx expo run:ios --device` and leave the terminal open.

### If the build says "No profiles" / `allowProvisioningUpdates`

The project already has a development team, so Expo does not pass `-allowProvisioningUpdates`. After the old profile expires, Xcode will not create a new one and the build stops with:

`No profiles for 'com.alexwoon.musicplayer' were found`

Build once from the project folder with the flag (use the device id printed as `Using --device …`):

```bash
xcodebuild -workspace ios/MusicPlayer.xcworkspace -scheme MusicPlayer -configuration Release -destination 'id=DEVICE_ID' -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM=GQCDC5S6CY
```

A Mac dialog may ask you to sign in to your Apple ID. After that command succeeds, run `npx expo run:ios --device --configuration Release` again. The new profiles are on disk, so the second install can finish.

Signing in Xcode also refreshes the profiles: open `ios/MusicPlayer.xcworkspace`, choose the iPhone as the run destination, and press Run.

### Trust the new certificate

The first launch after a new certificate often fails until you trust it:

1. On the iPhone: **Settings → General → VPN & Device Management**
2. Under **Developer App**, tap your Apple ID
3. Tap **Trust**

Open **Music Player** again.

A free Apple ID expires again in about 7 days. Repeat the Release command above. A paid Apple Developer account ($99/year) keeps the install valid for a year.

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

