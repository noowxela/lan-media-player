# 001 — Background sharing, persistent pairing, token-only data access

- **Status:** draft (implemented in the working tree 2026-10-26, not committed; needs a native rebuild)
- **Asked by:** Alex. Locking the phone dropped the Knowledge Dashboard ↔ phone connection, and the app had to stay open on Transfer.

## Problem

1. The HTTP share lived in `transfer.tsx` state. Leaving the tab or the JS runtime suspending killed it.
2. On lock, iOS suspends the app within seconds unless audio plays (`UIBackgroundModes: audio` is already set).
3. Every Start sharing made a new PIN and dropped all sessions, so the dashboard needed PIN + Accept again.
4. Security gap: every data endpoint worked with the PIN alone. Accept only mattered for clients that sent a token.

## Design

| Piece | File |
| --- | --- |
| App-level share lifecycle + access prompts | `src/lib/sharing-context.tsx` (`SharingProvider` in `_layout.tsx`, inside `MusicProvider`) |
| Persistent "分享中" pill on every tab (tap → Transfer, Stop) | `src/components/sharing-banner.tsx` |
| Pairing + settings store (dotfile `Documents/.lan-pairing.json`, hidden in Files) | `src/lib/lan-pairing.ts` |
| Sessions, paired tokens, revoke | `src/lib/lan-access.ts` |
| Auth v2, sleeping state, in-flight tracking, Range resume, Bonjour | `src/lib/lan-server.ts` |
| Native: `beginBackgroundTask` + Bonjour `NetService` | `modules/kc-background` (local Expo module, autolinked) |
| Settings: 锁屏保持连接, Fixed PIN, New PIN, paired computers | `src/app/settings.tsx` |

### Phases (`SharePhase`)

`off` → `starting` → `on` → (background, nothing playing) `sleeping` → `paused` → (app opened) `on`.

- **Background while music plays** (or 锁屏保持连接 on): nothing changes. Audio keeps the JS runtime and the TCP server alive.
- **Background, nothing playing:**
  1. `beginBackgroundTask` (about 30 s).
  2. `setShareState('sleeping')`: `/api/ping` returns `state:"sleeping"`; new requests get `503 Sleeping` with `X-Phone-State: sleeping`.
  3. Wait for in-flight requests (max 25 s) and at least 4 s, so a polling dashboard notices.
  4. `stopLanServer({ keepSessions: true })`, then `paused`.
- If music starts again, or the app comes back during the drain, it simply wakes up.
- **Foreground:** if `paused`, the server is broken, or the app was away for more than 8 s without keep-alive, `startLanServer({ resume: true })` restarts with the **same PIN and sessions**. Paired tokens are persistent anyway.
- **Without the native module** (a JS-only reload before rebuilding), the drain still runs but iOS freezes JS after about 5 s. On return the share restarts the same way.

### Pairing / auth (API v2, `LAN_API_VERSION = 2`)

- A client that sends `X-Pair: 1` (and optionally `X-Client-Name`) on `GET /?pin=` gets a 32-char token. The phone prompt says "Accept & remember". After Accept the token is stored in `.lan-pairing.json` and works on every later share **without PIN or Accept**.
- **Every data endpoint now requires a valid token:** an accepted session or a paired token. The PIN alone only opens `/` (the pairing flow), `/api/access` and `/api/ping`. 401 texts:
  - `Invalid PIN`: no or wrong PIN, no token.
  - `Not paired`: PIN ok but no token.
  - `Disconnected`: token revoked or session ended.
- `/api/ping` returns `{ok, api:2, state, id, paired}`. The `id` is a stable per-install device id.
- `POST /api/disconnect` ends the session. `?forget=1` also removes the pairing.
- Phone-side Disconnect on Transfer, or Forget in Settings, revokes the pairing, so the next connection needs Accept.
- Browser sessions (no `X-Pair`) behave as before and stay session-only.
- **Fixed PIN** setting: off by default. The PIN is kept across automatic background restarts either way. **New PIN** rotates it.

### Resume

`/files/<name>?download=1` and `/documents/file` now honour `Range` (206). Videos already did. Photos have no Range: they are built in memory, so the client retries the whole file.

### Bonjour

The share advertises `_kcphone._tcp` (TXT `id`, `api`) through the native module. `app.json` adds `NSBonjourServices: ["_kcphone._tcp"]`. The Knowledge Dashboard browses it with `dns-sd`.

### Delete grant: one approval per connection (2026-10-26)
- `src/lib/lan-delete-grant.ts`: the grant is keyed to the access token (pairing or session token).
  - Valid while `now − lastContact ≤ DELETE_GRANT_IDLE_MS` (30 min). `lan-server` calls `noteDeleteGrantContact` on every authenticated request.
  - Persisted in `Documents/.lan-delete-grants.json` (writes throttled to once per 60 s), so an app restart under 30 min keeps it.
- `POST /api/delete-grant` creates one pending request per token. `sharing-context` shows a single Alert, "Allow deletes? — Don't allow / Allow for this connection". The client polls `GET /api/delete-grant?id=`.
- `/api/delete` and `/api/documents/delete` need a grant: otherwise `403 {needGrant:true}`, header `X-Delete-Grant: required`.
- Before deleting, files are copied to `Documents/.Trash/<music|files>/<ts>-<name>`; `purgeTrash()` removes copies older than 30 days at server start.
- **Photos / videos are not gated:** iOS shows its own delete confirmation for every PhotoKit delete (an app cannot suppress it), and items go to Recently Deleted. That prompt is the single approval.
- The browser host page uses `deleteWithGrant()` (403 → request → wait → retry), so the phone prompts at most once per session.
- Revoke happens through the sharing banner `🗑 删除已授权 ✕`, `POST /api/delete-grant/revoke`, unpairing (`revokeDevice`), or a phone-side disconnect.
- Local deletes inside the app's own Library / Documents screens are the owner acting on his own phone. They are not remote approvals and never prompt.
- **Needs a rebuild/reload of the app.** It is JS-only with no new native modules, so a Metro reload or the normal Release build is enough.

### App version, About and release notes (2026-10-26, v1.0.1 build 2)
- **Version bump:** `app.json` version `1.0.0` → `1.0.1`, `ios.buildNumber` `"2"`, `android.versionCode` `2`.
- **Build info, with no new native module:**
  - `app.config.js` wraps `app.json` and adds `extra.buildInfo = { commit (git short), dirty, builtAt }`.
  - Release builds embed it at Xcode build time (expo-constants `EXConstants.bundle`).
  - With Metro the dev server re-evaluates it on every reload.
  - Read through `src/lib/app-info.ts` (`getAppInfo()`, `appInfoLine()`, `LAN_FEATURES`).
- **Settings → 关于 · 版本 About:**
  - shows version and build, commit (+ `-dirty`), build time, LAN API version and features;
  - tap or long-press copies them;
  - a **更新说明 · Release notes** button lists every version.
- **Release notes, single source `src/lib/changelog.json`** (newest first; `version`, `build`, `date`, `features` / `fixes` / `improvements`, Chinese first with English after):
  - the app reads it through `src/lib/changelog.ts`;
  - `docs/CHANGELOG.md` is generated from it (`node scripts/changelog-md.js`);
  - **when you bump the version, add an entry to the JSON first**.
- **What's new** (`src/components/whats-new-sheet.tsx` + `src/lib/whats-new.ts`):
  - On launch it compares the version with `Documents/.last-seen-version`. If they differ, it shows a one-time "本次更新 · What's new" sheet; 知道了 stores the version.
  - Builds before 1.0.1 never wrote the file, so a missing file can mean either an upgrade or a fresh install. The sheet is shown in both cases: on a fresh install it simply explains what the app does.
- **LAN:**
  - `GET /api/device` (token required) and `GET /api/ping` (only with a valid token) include `app: { version, build, commit, dirty, builtAt, features, api, notes }`, where `notes` is the current version's changelog entry.
  - Old builds report no `app`, so the dashboard shows "旧版本 (未知)" plus a reinstall hint.

## Alex has to

- Rebuild: `npx expo run:ios --device` (native changes: local module + Info.plist `NSBonjourServices`). A JS-only reload gives everything except the grace time and Bonjour.
- Optional: Settings → 锁屏保持连接 (静音保活), if the share should survive lock with no music. It uses more battery and is not App Store-safe.

## Not done

- No true unlimited background without audio. iOS does not allow it. The silent-audio toggle is the opt-in workaround.
- Tokens are stored in plain text in the app sandbox (no Keychain; `expo-secure-store` is not installed).
