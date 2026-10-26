import * as Cal from 'expo-calendar/legacy';

// iPhone Calendar + Reminders (EventKit via expo-calendar legacy API) for the LAN dashboard.
// Dates go over the wire as ISO strings with offset; the phone stores them in EventKit as absolute times.

export class CalendarPermissionError extends Error {
  constructor(public kind: 'calendar' | 'reminders', public status: string) {
    super(
      kind === 'calendar'
        ? '手机没有允许读取日历 · Calendar access not allowed (iPhone 设置 → Music Player → 日历)'
        : '手机没有允许读取提醒事项 · Reminders access not allowed (iPhone 设置 → Music Player → 提醒事项)',
    );
  }
}
export class ReadOnlyCalendarError extends Error {
  constructor(title: string) {
    super(`“${title}” 是只读日历, 不能修改 · Read-only calendar`);
  }
}
export class CalendarInputError extends Error {}

export type CalPermissions = { calendar: string; reminders: string };

export async function calendarPermissions(): Promise<CalPermissions> {
  const [c, r] = await Promise.all([Cal.getCalendarPermissionsAsync(), Cal.getRemindersPermissionsAsync()]);
  return { calendar: c.status, reminders: r.status };
}

/** Shows the iOS prompts (only the first time; afterwards iOS answers from Settings). */
export async function requestCalendarAccess(): Promise<CalPermissions> {
  const c = await Cal.requestCalendarPermissionsAsync();
  const r = await Cal.requestRemindersPermissionsAsync();
  return { calendar: c.status, reminders: r.status };
}

async function need(kind: 'calendar' | 'reminders'): Promise<void> {
  const p = kind === 'calendar' ? await Cal.getCalendarPermissionsAsync() : await Cal.getRemindersPermissionsAsync();
  if (p.status !== 'granted') throw new CalendarPermissionError(kind, p.status);
}

const iso = (d: string | Date | null | undefined): string | null => {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};
function toDate(v: unknown, field: string): Date {
  const d = new Date(String(v ?? ''));
  if (typeof v !== 'string' || Number.isNaN(d.getTime())) throw new CalendarInputError(`${field}: 需要 ISO 时间 · ISO date required`);
  return d;
}

export type CalendarInfo = { id: string; title: string; color: string; editable: boolean; source: string; type: string; primary: boolean };
function mapCalendar(c: Cal.Calendar): CalendarInfo {
  return {
    id: c.id,
    title: c.title,
    color: c.color,
    editable: !!c.allowsModifications,
    source: c.source?.name ?? '',
    type: String(c.type ?? ''),
    primary: !!c.isPrimary,
  };
}

export async function listCalendars(): Promise<{ calendars: CalendarInfo[]; lists: CalendarInfo[]; permissions: CalPermissions }> {
  const permissions = await calendarPermissions();
  const calendars = permissions.calendar === 'granted' ? (await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT)).map(mapCalendar) : [];
  const lists = permissions.reminders === 'granted' ? (await Cal.getCalendarsAsync(Cal.EntityTypes.REMINDER)).map(mapCalendar) : [];
  return { calendars, lists, permissions };
}

async function writableCalendar(id: string, entity: string): Promise<Cal.Calendar> {
  const all = await Cal.getCalendarsAsync(entity);
  const cal = all.find((c) => c.id === id);
  if (!cal) throw new CalendarInputError('找不到这个日历 / 列表 · Unknown calendar');
  if (!cal.allowsModifications) throw new ReadOnlyCalendarError(cal.title);
  return cal;
}

// ---------------------------------------------------------------- events
const FREQ = ['daily', 'weekly', 'monthly', 'yearly'];
export type EventOut = {
  id: string;
  calendarId: string;
  title: string;
  start: string | null;
  end: string | null;
  allDay: boolean;
  location: string;
  notes: string;
  url: string;
  alarms: number[];
  recurrence: { frequency: string; interval: number; endDate: string | null; occurrence: number | null } | null;
  instanceStart: string | null;
  timeZone: string;
  status: string;
  availability: string;
  organizer: string;
};
function mapEvent(e: Cal.Event): EventOut {
  const r = e.recurrenceRule;
  return {
    id: e.id,
    calendarId: e.calendarId,
    title: e.title ?? '',
    start: iso(e.startDate),
    end: iso(e.endDate),
    allDay: !!e.allDay,
    location: e.location ?? '',
    notes: e.notes ?? '',
    url: e.url ?? '',
    alarms: (e.alarms ?? []).map((a) => -(a.relativeOffset ?? 0)).filter((m) => Number.isFinite(m)),
    recurrence: r ? { frequency: String(r.frequency), interval: r.interval ?? 1, endDate: iso(r.endDate), occurrence: r.occurrence ?? null } : null,
    // the occurrence's own start (what EventKit needs to edit "this event" / "this and future")
    instanceStart: iso(e.originalStartDate ?? e.startDate),
    timeZone: e.timeZone ?? '',
    status: String(e.status ?? ''),
    availability: String(e.availability ?? ''),
    organizer: e.organizer?.name ?? e.organizerEmail ?? '',
  };
}

export async function listEvents(startIso: string, endIso: string, calendarIds?: string[]): Promise<EventOut[]> {
  await need('calendar');
  const start = toDate(startIso, 'start');
  const end = toDate(endIso, 'end');
  if (end <= start) throw new CalendarInputError('end 要晚于 start');
  if (end.getTime() - start.getTime() > 400 * 86400_000) throw new CalendarInputError('一次最多 400 天 · Range too long');
  const ids = calendarIds?.length ? calendarIds : (await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT)).map((c) => c.id);
  if (!ids.length) return [];
  const events = await Cal.getEventsAsync(ids, start, end); // recurring events come back as one item per occurrence
  return events.map(mapEvent).sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export async function eventDetail(id: string, instanceStart?: string) {
  await need('calendar');
  const opts = instanceStart ? { instanceStartDate: toDate(instanceStart, 'instanceStart') } : undefined;
  const ev = await Cal.getEventAsync(id, opts);
  let attendees: { name: string; email: string; status: string; role: string }[] = [];
  try {
    attendees = (await Cal.getAttendeesForEventAsync(id, opts)).map((a) => ({
      name: a.name ?? '',
      email: a.email ?? '',
      status: String(a.status ?? ''),
      role: String(a.role ?? ''),
    }));
  } catch {
    attendees = [];
  }
  return { ...mapEvent(ev), attendees }; // attendees are read-only (EventKit cannot invite from a third-party app)
}

type EventIn = Record<string, unknown>;
function eventDetails(b: EventIn, partial: boolean): Omit<Partial<Cal.Event>, 'id' | 'organizer'> {
  const d: Omit<Partial<Cal.Event>, 'id' | 'organizer'> = {};
  if (!partial || b.title !== undefined) {
    const t = String(b.title ?? '').trim();
    if (!t) throw new CalendarInputError('标题不能为空 · Title required');
    d.title = t.slice(0, 500);
  }
  if (!partial || b.start !== undefined) d.startDate = toDate(b.start, 'start');
  if (!partial || b.end !== undefined) d.endDate = toDate(b.end, 'end');
  if (d.startDate && d.endDate && d.endDate < d.startDate) throw new CalendarInputError('结束时间早于开始 · End before start');
  if (b.allDay !== undefined) d.allDay = !!b.allDay;
  if (b.location !== undefined) d.location = String(b.location ?? '').slice(0, 1000);
  if (b.notes !== undefined) d.notes = String(b.notes ?? '').slice(0, 20000);
  if (b.url !== undefined) d.url = String(b.url ?? '').slice(0, 2000);
  if (b.timeZone !== undefined && b.timeZone) d.timeZone = String(b.timeZone);
  if (Array.isArray(b.alarms)) d.alarms = b.alarms.slice(0, 5).map((m) => ({ relativeOffset: -Math.max(0, Number(m) || 0) }));
  if (b.recurrence !== undefined) {
    const r = b.recurrence as { frequency?: string; interval?: number; endDate?: string | null } | null;
    if (!r) d.recurrenceRule = null;
    else {
      if (!FREQ.includes(String(r.frequency))) throw new CalendarInputError('重复: daily / weekly / monthly / yearly');
      d.recurrenceRule = {
        frequency: String(r.frequency) as Cal.Frequency,
        interval: Math.max(1, Math.min(99, Number(r.interval) || 1)),
        ...(r.endDate ? { endDate: toDate(r.endDate, 'recurrence.endDate') } : {}),
      };
    }
  }
  return d;
}

export async function createEvent(b: EventIn): Promise<string> {
  await need('calendar');
  await writableCalendar(String(b.calendarId ?? ''), Cal.EntityTypes.EVENT);
  return Cal.createEventAsync(String(b.calendarId), eventDetails(b, false));
}

function spanOptions(b: EventIn): Cal.RecurringEventOptions | undefined {
  if (!b.instanceStart) return undefined;
  return { instanceStartDate: toDate(b.instanceStart, 'instanceStart'), futureEvents: b.span === 'future' };
}

async function eventCalendarWritable(id: string, opts?: Cal.RecurringEventOptions): Promise<void> {
  const ev = await Cal.getEventAsync(id, opts);
  await writableCalendar(ev.calendarId, Cal.EntityTypes.EVENT);
}

/** span: 'this' (this occurrence only) or 'future' (this and all future occurrences) for recurring events. */
export async function updateEvent(b: EventIn): Promise<string> {
  await need('calendar');
  const id = String(b.id ?? '');
  if (!id) throw new CalendarInputError('id required');
  const opts = spanOptions(b);
  await eventCalendarWritable(id, opts);
  if (b.calendarId) await writableCalendar(String(b.calendarId), Cal.EntityTypes.EVENT);
  const details = eventDetails(b, true);
  if (b.calendarId) (details as Partial<Cal.Event>).calendarId = String(b.calendarId);
  return Cal.updateEventAsync(id, details, opts);
}

export async function deleteEvent(b: EventIn): Promise<void> {
  await need('calendar');
  const id = String(b.id ?? '');
  if (!id) throw new CalendarInputError('id required');
  const opts = spanOptions(b);
  await eventCalendarWritable(id, opts);
  await Cal.deleteEventAsync(id, opts);
}

// ---------------------------------------------------------------- reminders
export type ReminderOut = {
  id: string;
  listId: string;
  title: string;
  notes: string;
  due: string | null;
  allDay: boolean;
  completed: boolean;
  completedAt: string | null;
  url: string;
  location: string;
  alarms: number[];
  recurring: boolean;
  created: string | null;
};
function mapReminder(r: Cal.Reminder): ReminderOut {
  return {
    id: r.id ?? '',
    listId: r.calendarId ?? '',
    title: r.title ?? '',
    notes: r.notes ?? '',
    due: iso(r.dueDate),
    allDay: !!r.allDay,
    completed: !!r.completed,
    completedAt: iso(r.completionDate),
    url: r.url ?? '',
    location: r.location ?? '',
    alarms: (r.alarms ?? []).map((a) => -(a.relativeOffset ?? 0)),
    recurring: !!r.recurrenceRule,
    created: iso(r.creationDate),
  };
}

export async function listReminders(status: 'all' | 'incomplete' | 'completed', listIds?: string[]): Promise<ReminderOut[]> {
  await need('reminders');
  const ids = listIds?.length ? listIds : (await Cal.getCalendarsAsync(Cal.EntityTypes.REMINDER)).map((c) => c.id);
  if (!ids.length) return [];
  const st = status === 'completed' ? Cal.ReminderStatus.COMPLETED : status === 'incomplete' ? Cal.ReminderStatus.INCOMPLETE : null;
  const out = await Cal.getRemindersAsync(ids, st, null, null);
  return out.map(mapReminder);
}

function reminderDetails(b: EventIn, partial: boolean): Cal.Reminder {
  const d: Cal.Reminder = {};
  if (!partial || b.title !== undefined) {
    const t = String(b.title ?? '').trim();
    if (!t) throw new CalendarInputError('标题不能为空 · Title required');
    d.title = t.slice(0, 500);
  }
  if (b.notes !== undefined) d.notes = String(b.notes ?? '').slice(0, 20000);
  if (b.due !== undefined) d.dueDate = b.due ? toDate(b.due, 'due') : undefined;
  if (b.allDay !== undefined) d.allDay = !!b.allDay;
  if (b.completed !== undefined) d.completed = !!b.completed;
  if (b.url !== undefined) d.url = String(b.url ?? '').slice(0, 2000);
  if (Array.isArray(b.alarms)) d.alarms = b.alarms.slice(0, 5).map((m) => ({ relativeOffset: -Math.max(0, Number(m) || 0) }));
  return d;
}

export async function createReminder(b: EventIn): Promise<string> {
  await need('reminders');
  await writableCalendar(String(b.listId ?? ''), Cal.EntityTypes.REMINDER);
  return Cal.createReminderAsync(String(b.listId), reminderDetails(b, false));
}

async function reminderWritable(id: string): Promise<void> {
  const r = await Cal.getReminderAsync(id);
  await writableCalendar(r.calendarId ?? '', Cal.EntityTypes.REMINDER);
}

export async function updateReminder(b: EventIn): Promise<string> {
  await need('reminders');
  const id = String(b.id ?? '');
  if (!id) throw new CalendarInputError('id required');
  await reminderWritable(id);
  const details = reminderDetails(b, true);
  if (b.listId) {
    await writableCalendar(String(b.listId), Cal.EntityTypes.REMINDER);
    details.calendarId = String(b.listId);
  }
  return Cal.updateReminderAsync(id, details);
}

export async function deleteReminder(b: EventIn): Promise<void> {
  await need('reminders');
  const id = String(b.id ?? '');
  if (!id) throw new CalendarInputError('id required');
  await reminderWritable(id);
  await Cal.deleteReminderAsync(id);
}
