import { File, Paths } from 'expo-file-system';

/**
 * Persistent LAN pairing + sharing settings (survives app restarts and background stops).
 *
 * - `paired`: computers (e.g. the Knowledge Dashboard) that were Accepted once with "remember". Their token
 *   works on every later share without PIN or Accept, until revoked here or by "Disconnect" on the phone.
 * - `pin`: the last PIN. Reused when sharing auto-restarts after the app comes back to the foreground, and
 *   always when `stablePin` is on.
 * - Stored as a dotfile in Documents (`.lan-pairing.json`), so the Files app does not list it.
 */
export type PairedDevice = {
  token: string;
  name: string;
  ip: string;
  pairedAt: number;
  lastSeen: number;
};

export type SharingSettings = {
  /** Play a silent looping track while sharing so iOS keeps the app alive when locked. Uses more battery. */
  keepAliveSilent: boolean;
  /** Keep the same PIN every time sharing starts (otherwise a new PIN per manual start). */
  stablePin: boolean;
};

type Store = {
  version: 1;
  deviceId: string;
  pin: string;
  settings: SharingSettings;
  paired: PairedDevice[];
};

const FILE_NAME = '.lan-pairing.json';
const MAX_PAIRED = 20;
const DEFAULT_SETTINGS: SharingSettings = { keepAliveSilent: false, stablePin: false };

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: Store | null = null;

export function randomToken(length = 32): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const cryptoObj = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  let out = '';
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  }
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function newPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function storeFile(): File {
  return new File(Paths.document, FILE_NAME);
}

function load(): Store {
  if (cache) return cache;
  let parsed: Partial<Store> = {};
  try {
    const file = storeFile();
    if (file.exists) parsed = JSON.parse(file.textSync()) as Partial<Store>;
  } catch {
    parsed = {};
  }
  cache = {
    version: 1,
    deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId ? parsed.deviceId : randomToken(12),
    pin: typeof parsed.pin === 'string' && /^\d{4}$/.test(parsed.pin) ? parsed.pin : '',
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    paired: Array.isArray(parsed.paired)
      ? parsed.paired.filter((d): d is PairedDevice => !!d && typeof d.token === 'string' && d.token.length >= 16)
      : [],
  };
  if (!parsed.deviceId) save();
  return cache;
}

function save(): void {
  if (!cache) return;
  try {
    const file = storeFile();
    if (!file.exists) file.create();
    file.write(JSON.stringify(cache));
  } catch {
    // storage full / unavailable: pairing still works for this session
  }
}

function changed(): void {
  save();
  for (const listener of listeners) listener();
}

export function subscribePairing(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDeviceId(): string {
  return load().deviceId;
}

export function getSharingSettings(): SharingSettings {
  return { ...load().settings };
}

export function setSharingSetting<K extends keyof SharingSettings>(key: K, value: SharingSettings[K]): void {
  load().settings[key] = value;
  changed();
}

/** PIN for the next start: the remembered one when resuming or when stablePin is on, otherwise a new one. */
export function pinForStart(resume: boolean): string {
  const store = load();
  if ((resume || store.settings.stablePin) && store.pin) return store.pin;
  store.pin = newPin();
  changed();
  return store.pin;
}

export function rotatePin(): string {
  load().pin = newPin();
  changed();
  return load().pin;
}

export function getPairedDevices(): PairedDevice[] {
  return load().paired.map((d) => ({ ...d }));
}

export function findPaired(token: string | null | undefined): PairedDevice | undefined {
  if (!token) return undefined;
  return load().paired.find((d) => d.token === token);
}

export function addPaired(token: string, name: string, ip: string): void {
  const store = load();
  const now = Date.now();
  store.paired = store.paired.filter((d) => d.token !== token && d.name !== name);
  store.paired.unshift({ token, name: name.slice(0, 80) || ip, ip, pairedAt: now, lastSeen: now });
  store.paired = store.paired.slice(0, MAX_PAIRED);
  changed();
}

let lastSeenWrite = 0;
export function touchPaired(token: string, ip: string): void {
  const device = findPaired(token);
  if (!device) return;
  device.ip = ip;
  device.lastSeen = Date.now();
  if (Date.now() - lastSeenWrite > 60_000) {
    lastSeenWrite = Date.now();
    save();
  }
}

export function revokePaired(token: string): void {
  const store = load();
  const before = store.paired.length;
  store.paired = store.paired.filter((d) => d.token !== token);
  if (store.paired.length !== before) changed();
}

export function revokeAllPaired(): void {
  load().paired = [];
  changed();
}
