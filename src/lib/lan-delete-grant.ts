import { File, Paths } from 'expo-file-system';

import { randomToken } from '@/lib/lan-pairing';

/**
 * "Allow deletes during this connection" grants for LAN clients (API v2, docs/sdd/001 §Delete grant).
 *
 * - The phone owner approves ONCE per connection (Alert in SharingProvider). The grant is tied to the client's
 *   access token (pairing or session token) and enforced here, server-side, for music + Documents deletes.
 * - The grant stays valid while the client keeps talking to us and survives sleep / Wi-Fi changes / app restarts
 *   as long as the last contact was < 30 min ago. More than 30 min of silence (or re-pairing = new token, or a
 *   revoke) → the next delete asks again.
 * - Photos / videos are not gated by this: iOS itself asks "Allow … to delete N photos?" for every delete and
 *   an app cannot skip that, so the system prompt is the single phone-side approval there.
 */
export const DELETE_GRANT_IDLE_MS = 30 * 60_000;

type Grant = { grantedAt: number; lastContact: number; name: string };
export type DeleteGrantRequest = { id: string; token: string; name: string; ip: string; createdAt: number; status: 'pending' | 'allowed' | 'denied' };
type Listener = () => void;

const FILE_NAME = '.lan-delete-grants.json';
const listeners = new Set<Listener>();
const requests = new Map<string, DeleteGrantRequest>();
let grants: Record<string, Grant> | null = null;
let lastWrite = 0;

function storeFile(): File {
  return new File(Paths.document, FILE_NAME);
}
function load(): Record<string, Grant> {
  if (grants) return grants;
  grants = {};
  try {
    const f = storeFile();
    if (f.exists) {
      const parsed = JSON.parse(f.textSync()) as Record<string, Grant>;
      for (const [token, g] of Object.entries(parsed ?? {})) {
        if (g && typeof g.lastContact === 'number' && typeof g.grantedAt === 'number') grants[token] = { grantedAt: g.grantedAt, lastContact: g.lastContact, name: String(g.name ?? '') };
      }
    }
  } catch {
    grants = {};
  }
  return grants;
}
function save(): void {
  lastWrite = Date.now();
  try {
    const f = storeFile();
    if (!f.exists) f.create();
    f.write(JSON.stringify(load()));
  } catch {
    // best effort: an unsaved grant only means one more prompt after an app restart
  }
}
function notify(): void {
  for (const l of listeners) l();
}

export function subscribeDeleteGrants(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Valid grant for this token? Expired grants are dropped here. */
export function deleteGrantFor(token: string | null | undefined): { granted: boolean; expiresAt: number; grantedAt: number } {
  if (!token) return { granted: false, expiresAt: 0, grantedAt: 0 };
  const all = load();
  const g = all[token];
  if (!g) return { granted: false, expiresAt: 0, grantedAt: 0 };
  if (Date.now() - g.lastContact > DELETE_GRANT_IDLE_MS) {
    delete all[token];
    save();
    notify();
    return { granted: false, expiresAt: 0, grantedAt: 0 };
  }
  return { granted: true, expiresAt: g.lastContact + DELETE_GRANT_IDLE_MS, grantedAt: g.grantedAt };
}

/** Every authenticated request extends the grant (the 30 min count from the LAST contact). Persisted ≤ once a minute. */
export function noteDeleteGrantContact(token: string): void {
  const all = load();
  const g = all[token];
  if (!g) return;
  if (Date.now() - g.lastContact > DELETE_GRANT_IDLE_MS) {
    deleteGrantFor(token);
    return;
  }
  g.lastContact = Date.now();
  if (Date.now() - lastWrite > 60_000) save();
}

export function requestDeleteGrant(token: string, name: string, ip: string): DeleteGrantRequest {
  for (const r of requests.values()) if (r.token === token && r.status === 'pending') return r;
  const req: DeleteGrantRequest = { id: randomToken(12), token, name: name || ip, ip, createdAt: Date.now(), status: 'pending' };
  requests.set(req.id, req);
  notify();
  return req;
}
export function getDeleteGrantRequest(id: string): DeleteGrantRequest | undefined {
  return requests.get(id);
}
export function getPendingDeleteGrants(): DeleteGrantRequest[] {
  const now = Date.now();
  for (const [id, r] of requests) if (now - r.createdAt > 10 * 60_000) requests.delete(id);
  return [...requests.values()].filter((r) => r.status === 'pending');
}
export function resolveDeleteGrant(id: string, allow: boolean): void {
  const req = requests.get(id);
  if (!req || req.status !== 'pending') return;
  req.status = allow ? 'allowed' : 'denied';
  if (allow) {
    load()[req.token] = { grantedAt: Date.now(), lastContact: Date.now(), name: req.name };
    save();
  }
  notify();
}
export function getActiveDeleteGrants(): { token: string; name: string; grantedAt: number; expiresAt: number }[] {
  return Object.entries(load())
    .filter(([token]) => deleteGrantFor(token).granted)
    .map(([token, g]) => ({ token, name: g.name, grantedAt: g.grantedAt, expiresAt: g.lastContact + DELETE_GRANT_IDLE_MS }));
}
export function revokeDeleteGrant(token: string): void {
  const all = load();
  if (!all[token]) return;
  delete all[token];
  save();
  notify();
}
export function revokeAllDeleteGrants(): void {
  grants = {};
  save();
  notify();
}
