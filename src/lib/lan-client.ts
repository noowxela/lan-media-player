import { addTrackFromBytes, ensureMusicDir } from '@/lib/library';
import { LAN_PORT } from '@/lib/lan-server';
import type { RemoteTrack } from '@/lib/types';

export function normalizeHostInput(input: string): { host: string; port: number } {
  const trimmed = input.trim().replace(/^https?:\/\//, '');
  const withoutPath = trimmed.split('/')[0] ?? trimmed;
  const [host, portText] = withoutPath.split(':');
  const port = portText ? Number(portText) : LAN_PORT;
  return { host: host || '127.0.0.1', port: Number.isFinite(port) ? port : LAN_PORT };
}

export function hostBaseUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

function withPin(url: string, pin: string): string {
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}pin=${encodeURIComponent(pin)}`;
}

export async function fetchRemoteTracks(baseUrl: string, pin: string): Promise<RemoteTrack[]> {
  const response = await fetch(withPin(`${baseUrl.replace(/\/$/, '')}/api/tracks`, pin), {
    headers: { 'X-Pin': pin },
  });
  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Wrong PIN' : `Could not list tracks (${response.status})`);
  }
  const data = (await response.json()) as { tracks?: RemoteTrack[] };
  return data.tracks ?? [];
}

export async function downloadRemoteTrack(
  baseUrl: string,
  pin: string,
  track: RemoteTrack,
): Promise<void> {
  ensureMusicDir();
  const url = withPin(`${baseUrl.replace(/\/$/, '')}/files/${encodeURIComponent(track.filename)}`, pin);
  const response = await fetch(url, { headers: { 'X-Pin': pin } });
  if (!response.ok) {
    throw new Error(`Download failed for ${track.filename}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await addTrackFromBytes(track.filename, bytes);
}

export function parseJoinPayload(data: string): { host: string; port: number; pin?: string } | null {
  try {
    if (data.startsWith('http://') || data.startsWith('https://')) {
      const url = new URL(data);
      const port = url.port ? Number(url.port) : LAN_PORT;
      return {
        host: url.hostname,
        port,
        pin: url.searchParams.get('pin') ?? undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}
