import { revokeDeleteGrant } from '@/lib/lan-delete-grant';
import { addPaired, findPaired, randomToken, revokePaired, touchPaired } from '@/lib/lan-pairing';

export type AccessStatus = 'pending' | 'accepted' | 'declined' | 'disconnected';

export type AccessClient = {
  id: string;
  ip: string;
  status: AccessStatus;
  token: string;
  createdAt: number;
  disconnectedBy?: 'self' | 'host';
  /** Name the client sent (X-Client-Name), e.g. "Knowledge Dashboard (alexs-MacBook-Pro)". */
  name: string;
  /** Client asked to be remembered (X-Pair: 1). Accepting it stores the token in lan-pairing. */
  wantsPair: boolean;
  /** Token is a remembered pairing (survives Stop sharing / app restarts). */
  paired: boolean;
};

type AccessListener = () => void;
const listeners = new Set<AccessListener>();
const clients = new Map<string, AccessClient>();
const reconnectableIps = new Set<string>();

function notify(): void {
  for (const listener of listeners) listener();
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeClientIp(raw?: string): string {
  if (!raw) return 'Unknown device';
  return raw.replace(/^::ffff:/, '');
}

export function subscribeLanAccess(listener: AccessListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPendingAccessClients(): AccessClient[] {
  return [...clients.values()].filter((client) => client.status === 'pending');
}

export function getConnectedClients(): AccessClient[] {
  return [...clients.values()].filter((client) => client.status === 'accepted');
}

export function getAccessClient(id: string): AccessClient | undefined {
  return clients.get(id);
}

/** Valid = an accepted session token of this share, or a remembered pairing token. */
export function isAccessTokenValid(token: string | null | undefined): boolean {
  if (!token) return false;
  if (findPaired(token)) return true;
  return [...clients.values()].some((item) => item.token === token && item.status === 'accepted');
}

/**
 * Called for every request that carries a valid token: refreshes lastSeen and, for a remembered pairing,
 * (re)creates the accepted session so it shows under "Connected devices" after a restart.
 */
export function noteTokenUse(token: string, ip: string): void {
  const device = findPaired(token);
  if (!device) return;
  touchPaired(token, ip);
  const existing = [...clients.values()].find((item) => item.token === token);
  if (existing) {
    if (existing.status !== 'accepted' || existing.ip !== ip) {
      existing.status = 'accepted';
      existing.ip = ip;
      existing.disconnectedBy = undefined;
      notify();
    }
    return;
  }
  const client: AccessClient = {
    id: newId(),
    ip,
    status: 'accepted',
    token,
    createdAt: Date.now(),
    name: device.name,
    wantsPair: true,
    paired: true,
  };
  clients.set(client.id, client);
  notify();
}

export function acceptedClientForIp(ip: string): AccessClient | undefined {
  return [...clients.values()].find((client) => client.ip === ip && client.status === 'accepted' && !client.paired);
}

export function pendingClientForIp(ip: string): AccessClient | undefined {
  return [...clients.values()].find((client) => client.ip === ip && client.status === 'pending');
}

export function createPendingAccess(ip: string, name = '', wantsPair = false): AccessClient {
  const existingPending = pendingClientForIp(ip);
  if (existingPending) return existingPending;
  const existingAccepted = acceptedClientForIp(ip);
  if (existingAccepted && !wantsPair) return existingAccepted;

  const client: AccessClient = {
    id: newId(),
    ip,
    // a browser that was accepted earlier in this share may reload without a second prompt;
    // a pairing request (dashboard) always needs one Accept on the phone
    status: reconnectableIps.has(ip) && !wantsPair ? 'accepted' : 'pending',
    token: wantsPair ? randomToken(32) : newId(),
    createdAt: Date.now(),
    name: name.slice(0, 80),
    wantsPair,
    paired: false,
  };
  clients.set(client.id, client);
  notify();
  return client;
}

export function resolveAccessRequest(id: string, accepted: boolean): AccessClient | undefined {
  const client = clients.get(id);
  if (!client || client.status !== 'pending') return client;
  client.status = accepted ? 'accepted' : 'declined';
  if (accepted && client.wantsPair) {
    addPaired(client.token, client.name || client.ip, client.ip);
    client.paired = true;
  } else if (accepted) reconnectableIps.add(client.ip);
  else reconnectableIps.delete(client.ip);
  notify();
  return client;
}

/** Phone-side Disconnect: ends the session and forgets the pairing (next time needs Accept again). */
export function disconnectClient(id: string): void {
  const client = clients.get(id);
  if (!client) return;
  client.status = 'disconnected';
  client.disconnectedBy = 'host';
  reconnectableIps.delete(client.ip);
  if (client.paired) revokePaired(client.token);
  revokeDeleteGrant(client.token);
  client.paired = false;
  notify();
}

/** Settings → paired devices → Forget. */
export function revokeDevice(token: string): void {
  revokePaired(token);
  revokeDeleteGrant(token);
  for (const client of clients.values()) {
    if (client.token === token) {
      client.status = 'disconnected';
      client.disconnectedBy = 'host';
      client.paired = false;
    }
  }
  notify();
}

/** Client-side disconnect (POST /api/disconnect). `forget` also removes the pairing. */
export function disconnectByToken(token: string, forget = false): boolean {
  const client = [...clients.values()].find((item) => item.token === token);
  if (forget) {
    revokePaired(token);
    revokeDeleteGrant(token);
  }
  if (!client) return forget;
  client.status = 'disconnected';
  client.disconnectedBy = 'self';
  if (forget) client.paired = false;
  notify();
  return true;
}

/** Clears this share's sessions. Remembered pairings stay (see lan-pairing). */
export function resetLanAccess(): void {
  clients.clear();
  reconnectableIps.clear();
  notify();
}

export function accessTokenFromRequest(query: URLSearchParams, headers: Record<string, string>): string {
  return query.get('access') || headers['x-access'] || '';
}
