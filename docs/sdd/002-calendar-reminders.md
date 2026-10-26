# 002 · Calendar & Reminders over LAN (EventKit)

Status: implemented in the working tree (2026-10-26), needs a native rebuild · Version 1.0.2 (build 3) · Dashboard side: knowledge center `docs/sdd/045-phone-calendar.md`

## What

The paired computer (Knowledge Center → 📅 日历) can list, create, edit and delete iPhone Calendar events and Reminders through this app's LAN server.

## Pieces

- `expo-calendar` (~57.0.6, installed with `npx expo install expo-calendar`), used through **`expo-calendar/legacy`** (the classic `getEventsAsync` / `updateEventAsync(id, details, {instanceStartDate, futureEvents})` API; the package root is the new object API).
- `app.json` → plugin `expo-calendar` with Chinese + English `calendarPermission` / `remindersPermission`. The plugin writes `NSCalendarsUsageDescription`, `NSCalendarsFullAccessUsageDescription` (iOS 17+), `NSRemindersUsageDescription`, `NSRemindersFullAccessUsageDescription`.
- `src/lib/phone-calendar.ts`: permissions, calendars / lists, events (range ≤ 400 days, recurring occurrences, all-day, location, notes, URL, alarms as minutes-before, recurrence, attendees read-only), event create / update / delete with span `this` | `future`, reminders list / create / update (incl. complete) / delete. Writes check `allowsModifications` first → `ReadOnlyCalendarError`.
- `src/lib/lan-server.ts` → `handleCalendarRequest` (after the token check and the sleeping check, so: token-only, 503 while sleeping):

| Method + path | Notes |
|---|---|
| `GET /api/calendar/permission` | `{calendar, reminders}` status |
| `POST /api/calendar/permission` | shows the iOS prompts (only the first time) |
| `GET /api/calendar/calendars` | `{calendars, lists, permissions}`; `editable`, `color`, `source`, `type`, `primary` |
| `GET /api/calendar/events?start&end[&calendars=id,id]` | ISO dates |
| `GET /api/calendar/event?id[&instanceStart]` | + attendees |
| `POST /api/calendar/event` | create `{calendarId, title, start, end, allDay, location, notes, url, alarms[], recurrence{frequency, interval, endDate}, timeZone}` |
| `POST /api/calendar/event/update` | `{id, …fields, instanceStart, span}` |
| `POST /api/calendar/event/delete` | **needs the delete grant** (`needDeleteGrant()` 403) |
| `GET /api/reminders?status=all\|incomplete\|completed[&lists=…]` | |
| `POST /api/reminders` / `POST /api/reminders/update` | `{listId, title, notes, due, allDay, completed, url, alarms}` |
| `POST /api/reminders/delete` | **needs the delete grant** |

  - Errors: 403 `{needPermission: 'calendar'|'reminders'}` with a Settings hint, 403 `{readOnly: true}`, 400 bad input, 500 other.
- `LAN_FEATURES` += `calendar`, `reminders` (the dashboard shows the rebuild hint when they are missing).
- Settings → **日历与提醒事项** card (`src/components/calendar-access-card.tsx`): status of both permissions, "允许访问" (prompts), and when denied "打开 iPhone 设置" (`Linking.openSettings()`); re-checks when the app becomes active.

## Alex has to

- Native rebuild (new native module + Info.plist keys):
  `cd ~/Documents/github/01_project/musicPlayer && npx expo prebuild --platform ios && npx expo run:ios --device --configuration Release`
- On first use: Settings → 日历与提醒事项 → 允许访问 (choose **完全访问 / Full Access**), or press "📲 在手机上请求授权" on the dashboard while the app is open.

## Limits

- Reminder priority / sub-tasks / tags are not in expo-calendar's API.
- Clearing a reminder due date may be ignored by expo-calendar on iOS (to verify).
- Recurrence editing: frequency + interval + end date only.

## Tests

Box harness `/workspace/mptest` bundles the real `lan-server.ts` + `phone-calendar.ts` with `shims/expo-calendar.js` (in-memory EventKit: 3 calendars incl. a read-only holiday calendar, recurring daily / weekly events, 2 reminder lists). `cal-check.js` = 31 checks; dashboard `t41.js` = 43 checks. No real calendar was touched.
