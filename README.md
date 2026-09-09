# Music Player

Expo iOS app for a local MP3 library, background playback, and same-Wi-Fi transfer. A phone can host an HTTP share on port **8765**; a computer opens the link in a browser, or another phone joins from the Transfer tab.

Expo Go is not enough. Native modules (`react-native-tcp-socket`, `expo-media-library`, camera) need a development build.

## Features

- **Library** — import MP3s, play, multi-select, delete
- **Now Playing** — seek, prev / pause / next, loop, lock-screen audio
- **Transfer (host)** — QR + PIN, connected devices, Accept / Decline / Disconnect
- **Transfer (join)** — type IP + PIN or scan the host QR, then download tracks
- **LAN browser page** — Home, Photos, Videos, Music, Documents
- **Settings** — on-device library folder (Files app on iOS: On My iPhone → Music Player → music)

The browser share is PIN-protected. A new computer waits until you Accept on the phone. After you quit the LAN page, reload reconnects that computer without a second prompt. Disconnecting it from the phone requires Accept again.

## Run

```bash
npm install
npx expo run:ios
```

Device:

```bash
npx expo run:ios --device
```

Keep the Metro bundler running. After JS-only LAN HTML changes, reload the app, then **Stop sharing → Start sharing**, and refresh the browser.

Photos and videos need a native rebuild after adding `expo-media-library` / `expo-video-thumbnails`. Do not add `expo-image-manipulator` or `expo-video-thumbnails` to the `plugins` array in `app.json` (those packages have no config plugin and will crash prebuild).

## LAN share

1. Same Wi-Fi (not a guest network that isolates clients).
2. Transfer → Host → **Start sharing**. Allow Photos if you want the gallery.
3. Keep Transfer open. Open the URL or scan the QR on a computer.
4. Enter the PIN if the link has none. Tap **Accept** on the phone.
5. **Stop sharing** drops every browser session.

PIN changes each time you start sharing.

## Stack

Expo SDK 57, Expo Router, `expo-audio`, `react-native-tcp-socket` (LAN HTTP), `expo-media-library` (photos and videos).
