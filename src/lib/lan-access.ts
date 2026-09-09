export type AccessStatus = 'pending' | 'accepted' | 'declined' | 'disconnected';

export type AccessClient = {
  id: string;
  ip: string;
  status: AccessStatus;
  token: string;
  createdAt: number;
  disconnectedBy?: 'self' | 'host';
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

export function isAccessTokenValid(token: string | null | undefined): boolean {
  if (!token) return false;
  const client = [...clients.values()].find((item) => item.token === token);
  return client?.status === 'accepted';
}

export function acceptedClientForIp(ip: string): AccessClient | undefined {
  return [...clients.values()].find((client) => client.ip === ip && client.status === 'accepted');
}

export function pendingClientForIp(ip: string): AccessClient | undefined {
  return [...clients.values()].find((client) => client.ip === ip && client.status === 'pending');
}

export function createPendingAccess(ip: string): AccessClient {
  const existingPending = pendingClientForIp(ip);
  if (existingPending) return existingPending;
  const existingAccepted = acceptedClientForIp(ip);
  if (existingAccepted) return existingAccepted;

  const client: AccessClient = {
    id: newId(),
    ip,
    status: reconnectableIps.has(ip) ? 'accepted' : 'pending',
    token: newId(),
    createdAt: Date.now(),
  };
  clients.set(client.id, client);
  notify();
  return client;
}

export function resolveAccessRequest(id: string, accepted: boolean): AccessClient | undefined {
  const client = clients.get(id);
  if (!client || client.status !== 'pending') return client;
  client.status = accepted ? 'accepted' : 'declined';
  if (accepted) reconnectableIps.add(client.ip);
  else reconnectableIps.delete(client.ip);
  notify();
  return client;
}

export function disconnectClient(id: string): void {
  const client = clients.get(id);
  if (!client) return;
  client.status = 'disconnected';
  client.disconnectedBy = 'host';
  reconnectableIps.delete(client.ip);
  notify();
}

export function disconnectByToken(token: string): boolean {
  const client = [...clients.values()].find((item) => item.token === token);
  if (!client) return false;
  client.status = 'disconnected';
  client.disconnectedBy = 'self';
  notify();
  return true;
}

export function resetLanAccess(): void {
  clients.clear();
  reconnectableIps.clear();
  notify();
}

export function accessTokenFromRequest(query: URLSearchParams, headers: Record<string, string>): string {
  return query.get('access') || headers['x-access'] || '';
}
