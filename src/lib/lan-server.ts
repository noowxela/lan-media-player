import { Buffer } from 'buffer';
import TcpSocket from 'react-native-tcp-socket';
import type Socket from 'react-native-tcp-socket/lib/types/Socket';

import { hostPageHtml, pinErrorPageHtml, waitingPageHtml } from '@/lib/host-page';
import {
  acceptedClientForIp,
  accessTokenFromRequest,
  createPendingAccess,
  disconnectByToken,
  getAccessClient,
  isAccessTokenValid,
  normalizeClientIp,
  noteTokenUse,
  resetLanAccess,
} from '@/lib/lan-access';
import { getDeviceId, pinForStart } from '@/lib/lan-pairing';
import {
  deleteGrantFor,
  getDeleteGrantRequest,
  noteDeleteGrantContact,
  requestDeleteGrant,
  revokeDeleteGrant,
} from '@/lib/lan-delete-grant';
import { Directory, File, Paths } from 'expo-file-system';
import { publishBonjour, unpublishBonjour } from '../../modules/kc-background';
import { getAppInfo } from '@/lib/app-info';
import { changelogFor } from '@/lib/changelog';
import { getShareDeviceInfo } from '@/lib/device-info';
import {
  addDocumentFromBytes,
  contentTypeForFilename,
  deleteDocuments,
  documentsDir,
  getDocumentFile,
  listDocuments,
} from '@/lib/documents';
import { FAVICON_SVG, getFaviconPng } from '@/lib/favicon';
import {
  addTrackFromBytes,
  deleteTracksByFilenames,
  musicDir,
  getTrackFile,
  loadTracks,
} from '@/lib/library';
import {
  deletePhotos,
  getPhotoOriginal,
  getPhotoPreviewJpeg,
  getPhotoThumbBytes,
  getVideoFileInfo,
  getVideoThumbBytes,
  listPhotoAlbums,
  listPhotos,
  listVideoAlbums,
  listVideos,
  PhotosPermissionError,
  readFileRange,
  streamFileRange,
} from '@/lib/photos';
import type { Track } from '@/lib/types';

export const LAN_PORT = 8765;
/** Protocol version reported by /api/ping. 2 = token auth on every endpoint, paired tokens, sleeping state, Range downloads. */
export const LAN_API_VERSION = 2;

function appInfoJson() {
  const info = getAppInfo();
  const notes = changelogFor(info.version);
  return { ...info, api: LAN_API_VERSION, notes: notes ?? null };
}
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const VIDEO_RANGE_MAX = 2 * 1024 * 1024;
const HEADER_BREAK = Buffer.from('\r\n\r\n');

type StreamResult = {
  head: Buffer;
  uri: string;
  start: number;
  end: number;
};

type HttpResult = Buffer | StreamResult;

export type UploadBatchResult = {
  tracks: Track[];
  failed: number;
};

type IncomingUploadListener = (result: UploadBatchResult) => void;
const incomingUploadListeners = new Set<IncomingUploadListener>();

const BATCH_IDLE_MS = 1500;
let pendingBatchTracks: Track[] = [];
let pendingBatchTimer: ReturnType<typeof setTimeout> | null = null;

export function subscribeIncomingUploads(listener: IncomingUploadListener): () => void {
  incomingUploadListeners.add(listener);
  return () => {
    incomingUploadListeners.delete(listener);
  };
}

function flushIncomingUploadBatch(failed = 0): void {
  if (pendingBatchTimer) {
    clearTimeout(pendingBatchTimer);
    pendingBatchTimer = null;
  }
  const tracks = pendingBatchTracks;
  pendingBatchTracks = [];
  if (tracks.length === 0 && failed === 0) return;
  const result: UploadBatchResult = { tracks, failed };
  for (const listener of incomingUploadListeners) {
    listener(result);
  }
}

function notifyIncomingUpload(track: Track): void {
  pendingBatchTracks.push(track);
  if (pendingBatchTimer) {
    clearTimeout(pendingBatchTimer);
  }
  pendingBatchTimer = setTimeout(() => {
    flushIncomingUploadBatch(0);
  }, BATCH_IDLE_MS);
}

type HeaderMap = Record<string, string>;

type ParsedRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: HeaderMap;
  body: Buffer;
};

let server: ReturnType<typeof TcpSocket.createServer> | null = null;
let currentPin = '';
const activeSockets = new Set<Socket>();

/** 'sleeping' = the app is about to be suspended: in-flight transfers finish, new requests get 503 Sleeping. */
export type ShareState = 'awake' | 'sleeping';
let shareState: ShareState = 'awake';
let inflight = 0;
let serverBroken = false;
type ServerListener = () => void;
const serverListeners = new Set<ServerListener>();
function notifyServer(): void {
  for (const listener of serverListeners) listener();
}
export function subscribeLanServer(listener: ServerListener): () => void {
  serverListeners.add(listener);
  return () => {
    serverListeners.delete(listener);
  };
}
export function setShareState(next: ShareState): void {
  if (shareState === next) return;
  shareState = next;
  notifyServer();
}
export function getShareState(): ShareState {
  return shareState;
}
export function inflightRequests(): number {
  return inflight;
}
/** True when the listening socket reported an error/close (e.g. iOS reclaimed it while suspended). */
export function isServerBroken(): boolean {
  return serverBroken;
}
/** Resolves when no request is being served (or after timeoutMs). Returns true when idle. */
export async function waitForIdle(timeoutMs: number, shouldStop?: () => boolean): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (inflight > 0 && Date.now() < until) {
    if (shouldStop?.()) return false;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return inflight === 0;
}

function concat(a: Buffer, b: Buffer): Buffer {
  return Buffer.concat([a, b]);
}

function headerValue(headers: HeaderMap, name: string): string {
  return headers[name.toLowerCase()] ?? '';
}

function parseHeaders(raw: string): { method: string; path: string; headers: HeaderMap } {
  const lines = raw.split('\r\n');
  const [method = 'GET', target = '/'] = (lines[0] ?? '').split(' ');
  const headers: HeaderMap = {};
  for (const line of lines.slice(1)) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return { method: method.toUpperCase(), path: target, headers };
}

function pinMatches(request: ParsedRequest, pin: string): boolean {
  const provided = request.query.get('pin') || headerValue(request.headers, 'x-pin');
  return !!pin && provided === pin;
}

/** 403 for music / Documents deletes until the phone owner allowed deletes for this connection. */
function needDeleteGrant(): Buffer {
  return httpResponse(
    403,
    'Forbidden',
    { 'Content-Type': 'application/json', 'X-Delete-Grant': 'required' },
    JSON.stringify({ ok: false, error: 'Delete not allowed', needGrant: true }),
  );
}

const TRASH_KEEP_MS = 30 * 24 * 60 * 60_000;
/** Deleted music / Documents are copied to Documents/.Trash/<kind>/<time>-<name> first and kept 30 days (no iOS trash for app files). */
function keepInTrash(dir: Directory, kind: string, filenames: string[]): void {
  try {
    const trash = new Directory(Paths.document, '.Trash', kind);
    if (!trash.exists) trash.create({ intermediates: true });
    const stamp = Date.now();
    for (const raw of filenames) {
      const name = raw.replace(/\\/g, '/').split('/').pop() ?? '';
      if (!name || name.startsWith('.')) continue;
      const src = new File(dir, name);
      if (src.exists) src.copy(new File(trash, `${stamp}-${name}`));
    }
  } catch {
    // best effort: a failed trash copy must not block the delete the owner asked for
  }
}
function purgeTrash(): void {
  try {
    for (const kind of ['music', 'files']) {
      const trash = new Directory(Paths.document, '.Trash', kind);
      if (!trash.exists) continue;
      for (const item of trash.list()) {
        const stamp = Number(String(item.name ?? '').split('-')[0]);
        if (item instanceof File && stamp && Date.now() - stamp > TRASH_KEEP_MS) item.delete();
      }
    }
  } catch {
    // ignore
  }
}

function unauthorized(text: string): Buffer {
  return httpResponse(401, 'Unauthorized', { 'Content-Type': 'text/plain' }, text);
}

function httpHead(status: number, reason: string, headers: HeaderMap, contentLength: number): Buffer {
  const lines = [
    `HTTP/1.1 ${status} ${reason}`,
    'Connection: close',
    'Access-Control-Allow-Origin: *',
    'Access-Control-Allow-Headers: *',
    'Access-Control-Allow-Methods: GET, POST, OPTIONS',
    'Accept-Ranges: bytes',
    `Content-Length: ${contentLength}`,
    ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
    '',
    '',
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8');
}

function httpResponse(
  status: number,
  reason: string,
  headers: HeaderMap,
  body: Buffer | string = '',
): Buffer {
  const payload = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  return concat(httpHead(status, reason, headers, payload.length), payload);
}

function isStreamResult(value: HttpResult): value is StreamResult {
  return !Buffer.isBuffer(value);
}

async function writeAll(
  socket: Socket,
  data: Buffer,
): Promise<void> {
  const chunkSize = 256 * 1024;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, Math.min(offset + chunkSize, data.length));
    await new Promise<void>((resolve, reject) => {
      socket.write(chunk, undefined, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

function decodeFilenameParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseByteRange(header: string, size: number): { start: number; end: number } | null {
  const match = header.match(/bytes=(\d*)-(\d*)/i);
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!match[1] && match[2]) {
    const suffix = Number(match[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || start > end) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

async function handleRequest(request: ParsedRequest, pin: string, clientIp: string): Promise<HttpResult> {
  if (request.method === 'OPTIONS') {
    return httpResponse(204, 'No Content', { 'Content-Type': 'text/plain' });
  }

  const pathname = request.path.split('?')[0] || '/';

  if (request.method === 'GET' && (pathname === '/favicon.svg' || pathname === '/favicon.ico')) {
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-cache' },
      FAVICON_SVG,
    );
  }

  if (request.method === 'GET' && (pathname === '/favicon.png' || pathname === '/apple-touch-icon.png')) {
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'image/png', 'Cache-Control': 'no-cache' },
      await getFaviconPng(),
    );
  }

  // Auth (API v2): a valid access token (accepted session or remembered pairing) is required for every data
  // endpoint. The PIN alone only opens the pairing flow (/, /api/access) and /api/ping; it no longer grants data.
  const accessToken = accessTokenFromRequest(request.query, request.headers);
  const tokenOk = isAccessTokenValid(accessToken);
  if (tokenOk) {
    noteTokenUse(accessToken, clientIp);
    noteDeleteGrantContact(accessToken);
  }
  const pinOk = pinMatches(request, pin);

  if (pathname === '/api/ping' && request.method === 'GET') {
    if (accessToken && !tokenOk) return unauthorized(pinOk ? 'Disconnected' : 'Not paired');
    if (!tokenOk && !pinOk) return unauthorized('Invalid PIN');
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'application/json', 'X-Phone-State': shareState },
      JSON.stringify({ ok: true, api: LAN_API_VERSION, state: shareState, id: getDeviceId(), paired: tokenOk, deleteGrant: tokenOk ? deleteGrantFor(accessToken) : undefined, app: tokenOk ? appInfoJson() : undefined }),
    );
  }

  if (pathname === '/' && request.method === 'GET') {
    const htmlHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    };
    if (tokenOk) {
      return httpResponse(200, 'OK', htmlHeaders, hostPageHtml(pinOk ? pin : '', accessToken));
    }
    if (!pinOk) {
      return httpResponse(
        401,
        'Unauthorized',
        { ...htmlHeaders },
        pinErrorPageHtml(request.query.get('pin') || ''),
      );
    }
    if (shareState === 'sleeping') {
      return httpResponse(503, 'Service Unavailable', { 'Content-Type': 'text/plain', 'X-Phone-State': 'sleeping', 'Retry-After': '30' }, 'Sleeping');
    }
    const wantsPair = headerValue(request.headers, 'x-pair') === '1';
    const clientName = headerValue(request.headers, 'x-client-name').replace(/[^\p{L}\p{N} ._()@'-]/gu, '').slice(0, 80);
    const session = (!wantsPair && acceptedClientForIp(clientIp)) || createPendingAccess(clientIp, clientName, wantsPair);
    if (session.status === 'accepted') {
      if (accessToken !== session.token) {
        return httpResponse(
          302,
          'Found',
          {
            Location: `/?pin=${encodeURIComponent(pin)}&access=${encodeURIComponent(session.token)}`,
            'Cache-Control': 'no-store',
          },
          '',
        );
      }
      return httpResponse(200, 'OK', htmlHeaders, hostPageHtml(pin, session.token));
    }
    if (accessToken) {
      return httpResponse(
        302,
        'Found',
        {
          Location: `/?pin=${encodeURIComponent(pin)}`,
          'Cache-Control': 'no-store',
        },
        '',
      );
    }
    return httpResponse(200, 'OK', htmlHeaders, waitingPageHtml(pin, session.id));
  }

  if (pathname === '/api/access' && request.method === 'GET') {
    if (!pinOk) return unauthorized('Invalid PIN');
    const client = getAccessClient(request.query.get('id') || '');
    if (!client) {
      return httpResponse(404, 'Not Found', { 'Content-Type': 'application/json' }, JSON.stringify({ error: 'Unknown request' }));
    }
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'application/json' },
      JSON.stringify({
        status: client.status,
        token: client.status === 'accepted' ? client.token : undefined,
        ip: client.ip,
        paired: client.paired,
      }),
    );
  }

  if (!tokenOk) {
    if (accessToken) return unauthorized('Disconnected');
    return unauthorized(pinOk ? 'Not paired' : 'Invalid PIN');
  }

  if (pathname === '/api/disconnect' && request.method === 'POST') {
    disconnectByToken(accessToken, request.query.get('forget') === '1');
    return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ ok: true }));
  }

  if (shareState === 'sleeping') {
    return httpResponse(503, 'Service Unavailable', { 'Content-Type': 'text/plain', 'X-Phone-State': 'sleeping', 'Retry-After': '30' }, 'Sleeping');
  }

  // ---- delete grant: one phone-side "Allow deletes during this connection" per client token (lan-delete-grant.ts)
  if (pathname === '/api/delete-grant' && request.method === 'GET') {
    const req = getDeleteGrantRequest(request.query.get('id') || '');
    const g = deleteGrantFor(accessToken);
    return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ ...g, request: req && req.token === accessToken ? req.status : undefined }));
  }
  if (pathname === '/api/delete-grant' && request.method === 'POST') {
    const g = deleteGrantFor(accessToken);
    if (g.granted) return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify(g));
    const name = headerValue(request.headers, 'x-client-name').replace(/[^\p{L}\p{N} ._()@'-]/gu, '').slice(0, 80);
    const req = requestDeleteGrant(accessToken, name, clientIp);
    return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ ...g, pending: true, id: req.id }));
  }
  if (pathname === '/api/delete-grant/revoke' && request.method === 'POST') {
    revokeDeleteGrant(accessToken);
    return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ ok: true, granted: false }));
  }

  if (pathname === '/api/device' && request.method === 'GET') {
    const info = await getShareDeviceInfo();
    return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ ...info, app: appInfoJson() }));
  }

  try {
    if (pathname === '/api/photos/albums' && request.method === 'GET') {
      const albums = await listPhotoAlbums();
      return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ albums }));
    }

    if (pathname === '/api/photos' && request.method === 'GET') {
      const page = await listPhotos(request.query.get('albumId') || undefined, request.query.get('after') || undefined);
      return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify(page));
    }

    if (pathname === '/api/photos/delete' && request.method === 'POST') {
      let ids: string[] = [];
      try {
        const parsed = JSON.parse(request.body.toString('utf8')) as { ids?: unknown };
        if (Array.isArray(parsed.ids)) {
          ids = parsed.ids.filter((id): id is string => typeof id === 'string');
        }
      } catch {
        ids = [];
      }
      const ok = await deletePhotos(ids);
      return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ ok }));
    }

    if (pathname === '/photos/thumb' && request.method === 'GET') {
      const id = request.query.get('id') || '';
      if (!id) {
        return httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Missing id');
      }
      const bytes = await getPhotoThumbBytes(id);
      return httpResponse(200, 'OK', { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' }, bytes);
    }

    if (pathname === '/photos/file' && request.method === 'GET') {
      const id = request.query.get('id') || '';
      if (!id) {
        return httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Missing id');
      }
      if (request.query.get('download') === '1') {
        const original = await getPhotoOriginal(id);
        return httpResponse(
          200,
          'OK',
          {
            'Content-Type': original.contentType,
            'Content-Disposition': `attachment; filename="photo.jpg"; filename*=UTF-8''${encodeURIComponent(original.filename)}`,
          },
          original.bytes,
        );
      }
      const preview = await getPhotoPreviewJpeg(id);
      return httpResponse(200, 'OK', { 'Content-Type': 'image/jpeg' }, preview);
    }

    if (pathname === '/api/videos/albums' && request.method === 'GET') {
      const albums = await listVideoAlbums();
      return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ albums }));
    }

    if (pathname === '/api/videos' && request.method === 'GET') {
      const page = await listVideos(request.query.get('albumId') || undefined, request.query.get('after') || undefined);
      return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify(page));
    }

    if (pathname === '/api/videos/delete' && request.method === 'POST') {
      let ids: string[] = [];
      try {
        const parsed = JSON.parse(request.body.toString('utf8')) as { ids?: unknown };
        if (Array.isArray(parsed.ids)) {
          ids = parsed.ids.filter((id): id is string => typeof id === 'string');
        }
      } catch {
        ids = [];
      }
      const ok = await deletePhotos(ids);
      return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ ok }));
    }

    if (pathname === '/videos/thumb' && request.method === 'GET') {
      const id = request.query.get('id') || '';
      if (!id) {
        return httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Missing id');
      }
      const bytes = await getVideoThumbBytes(id);
      return httpResponse(200, 'OK', { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=3600' }, bytes);
    }

    if (pathname === '/videos/file' && request.method === 'GET') {
      const id = request.query.get('id') || '';
      if (!id) {
        return httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Missing id');
      }
      const info = await getVideoFileInfo(id);
      const asDownload = request.query.get('download') === '1';
      const rangeHeader = headerValue(request.headers, 'range');
      const requested = rangeHeader
        ? parseByteRange(rangeHeader, info.size)
        : { start: 0, end: info.size - 1 };
      if (!requested) {
        return httpResponse(
          416,
          'Range Not Satisfiable',
          { 'Content-Type': 'text/plain', 'Content-Range': `bytes */${info.size}` },
          'Range not satisfiable',
        );
      }

      if (asDownload) {
        const length = requested.end - requested.start + 1;
        const status = rangeHeader ? 206 : 200;
        const headers: HeaderMap = {
          'Content-Type': info.contentType,
          'Content-Disposition': `attachment; filename="video.mp4"; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
        };
        if (rangeHeader) {
          headers['Content-Range'] = `bytes ${requested.start}-${requested.end}/${info.size}`;
        }
        return {
          head: httpHead(status, rangeHeader ? 'Partial Content' : 'OK', headers, length),
          uri: info.uri,
          start: requested.start,
          end: requested.end,
        };
      }

      const end = Math.min(requested.end, requested.start + VIDEO_RANGE_MAX - 1, info.size - 1);
      const length = end - requested.start + 1;
      const bytes = readFileRange(info.uri, requested.start, length);
      const partial = requested.start > 0 || end < info.size - 1;
      return httpResponse(
        partial ? 206 : 200,
        partial ? 'Partial Content' : 'OK',
        {
          'Content-Type': info.contentType,
          'Content-Disposition': 'inline',
          ...(partial ? { 'Content-Range': `bytes ${requested.start}-${end}/${info.size}` } : {}),
        },
        bytes,
      );
    }
  } catch (error) {
    if (error instanceof PhotosPermissionError) {
      return httpResponse(
        403,
        'Forbidden',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ error: error.message }),
      );
    }
    throw error;
  }

  if (pathname === '/api/tracks' && request.method === 'GET') {
    const tracks = await loadTracks();
    const payload = tracks.map((track) => {
      const file = getTrackFile(track);
      return {
        filename: track.filename,
        title: track.title,
        artist: track.artist || 'Unknown',
        duration: track.duration ?? 0,
        format: 'mp3',
        size: file.exists ? file.size : 0,
      };
    });
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ tracks: payload }),
    );
  }

  if (pathname.startsWith('/files/') && request.method === 'GET') {
    const filename = decodeFilenameParam(pathname.slice('/files/'.length)).replace(/\\/g, '/').split('/').pop() ?? '';
    if (!filename || filename.includes('..')) {
      return httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Bad filename');
    }
    const file = getTrackFile({
      id: filename,
      filename,
      title: filename,
      addedAt: 0,
    });
    if (!file.exists) {
      return httpResponse(404, 'Not Found', { 'Content-Type': 'text/plain' }, 'Not found');
    }
    const bytes = Buffer.from(await file.bytes());
    const asDownload = request.query.get('download') === '1';
    const rangeHeader = headerValue(request.headers, 'range');
    if (rangeHeader) {
      const range = parseByteRange(rangeHeader, bytes.length);
      if (!range) {
        return httpResponse(
          416,
          'Range Not Satisfiable',
          { 'Content-Type': 'text/plain', 'Content-Range': `bytes */${bytes.length}` },
          'Range not satisfiable',
        );
      }
      return httpResponse(
        206,
        'Partial Content',
        {
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${range.start}-${range.end}/${bytes.length}`,
          'Content-Disposition': asDownload
            ? `attachment; filename="track.mp3"; filename*=UTF-8''${encodeURIComponent(filename)}`
            : 'inline',
        },
        bytes.subarray(range.start, range.end + 1),
      );
    }
    return httpResponse(
      200,
      'OK',
      {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Content-Disposition': asDownload
          ? `attachment; filename="track.mp3"; filename*=UTF-8''${encodeURIComponent(filename)}`
          : 'inline',
      },
      bytes,
    );
  }

  if (pathname === '/api/delete' && request.method === 'POST') {
    let filenames: string[] = [];
    try {
      const parsed = JSON.parse(request.body.toString('utf8')) as { filenames?: unknown };
      if (Array.isArray(parsed.filenames)) {
        filenames = parsed.filenames.filter((name): name is string => typeof name === 'string');
      }
    } catch {
      filenames = [];
    }
    const single = request.query.get('filename');
    if (single) filenames.push(decodeFilenameParam(single));
    if (!deleteGrantFor(accessToken).granted) return needDeleteGrant();
    keepInTrash(musicDir(), 'music', filenames);
    const deleted = await deleteTracksByFilenames(filenames);
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ ok: deleted > 0, deleted }),
    );
  }

  if (pathname === '/api/documents' && request.method === 'GET') {
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ files: listDocuments() }),
    );
  }

  if (pathname === '/api/documents/delete' && request.method === 'POST') {
    let filenames: string[] = [];
    try {
      const parsed = JSON.parse(request.body.toString('utf8')) as { filenames?: unknown };
      if (Array.isArray(parsed.filenames)) {
        filenames = parsed.filenames.filter((name): name is string => typeof name === 'string');
      }
    } catch {
      filenames = [];
    }
    if (!deleteGrantFor(accessToken).granted) return needDeleteGrant();
    keepInTrash(documentsDir(), 'files', filenames);
    const deleted = deleteDocuments(filenames);
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ ok: deleted > 0, deleted }),
    );
  }

  if (pathname === '/documents/file' && request.method === 'GET') {
    const filename = decodeFilenameParam(request.query.get('name') || '').replace(/\\/g, '/').split('/').pop() ?? '';
    if (!filename || filename.includes('..')) {
      return httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Bad filename');
    }
    let file;
    try {
      file = getDocumentFile(filename);
    } catch {
      return httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Bad filename');
    }
    if (!file.exists) {
      return httpResponse(404, 'Not Found', { 'Content-Type': 'text/plain' }, 'Not found');
    }
    const size = file.size || 0;
    const asDownload = request.query.get('download') === '1';
    const safeName = file.name.replace(/"/g, '');
    if (size <= 0) {
      return httpResponse(
        200,
        'OK',
        {
          'Content-Type': contentTypeForFilename(file.name),
          'Content-Disposition': asDownload
            ? `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`
            : 'inline',
        },
        Buffer.alloc(0),
      );
    }
    const docHeaders: HeaderMap = {
      'Content-Type': contentTypeForFilename(file.name),
      'Content-Disposition': asDownload
        ? `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`
        : 'inline',
    };
    const docRangeHeader = headerValue(request.headers, 'range');
    if (docRangeHeader) {
      // resume support (API v2): the dashboard continues an interrupted download from its .part size
      const range = parseByteRange(docRangeHeader, size);
      if (!range) {
        return httpResponse(
          416,
          'Range Not Satisfiable',
          { 'Content-Type': 'text/plain', 'Content-Range': `bytes */${size}` },
          'Range not satisfiable',
        );
      }
      docHeaders['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
      return {
        head: httpHead(206, 'Partial Content', docHeaders, range.end - range.start + 1),
        uri: file.uri,
        start: range.start,
        end: range.end,
      };
    }
    return {
      head: httpHead(200, 'OK', docHeaders, size),
      uri: file.uri,
      start: 0,
      end: size - 1,
    };
  }

  if (pathname === '/documents/upload' && request.method === 'POST') {
    const encodedName =
      request.query.get('filename') || headerValue(request.headers, 'x-filename') || 'file';
    const name = decodeFilenameParam(encodedName);
    if (request.body.length === 0) {
      return httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Empty body');
    }
    const stored = await addDocumentFromBytes(name, request.body);
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ ok: true, file: stored }),
    );
  }

  if (pathname === '/upload' && request.method === 'POST') {
    const encodedName =
      request.query.get('filename') || headerValue(request.headers, 'x-filename') || 'track.mp3';
    const name = decodeFilenameParam(encodedName);
    if (request.body.length === 0) {
      return httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Empty body');
    }
    const track = await addTrackFromBytes(name, request.body);
    notifyIncomingUpload(track);
    return httpResponse(
      200,
      'OK',
      { 'Content-Type': 'application/json' },
      JSON.stringify({ ok: true, track }),
    );
  }

  if (pathname === '/api/upload-batch-complete' && request.method === 'POST') {
    const failed = Number(request.query.get('fail') || '0');
    flushIncomingUploadBatch(Number.isFinite(failed) ? Math.max(0, failed) : 0);
    return httpResponse(200, 'OK', { 'Content-Type': 'application/json' }, JSON.stringify({ ok: true }));
  }

  return httpResponse(404, 'Not Found', { 'Content-Type': 'text/plain' }, 'Not found');
}

function attachSocket(socket: Socket, pin: string): void {
  activeSockets.add(socket);
  let buffer = Buffer.alloc(0);
  let parsedHead: ReturnType<typeof parseHeaders> | null = null;
  let headerSize = 0;
  let handled = false;

  const maybeHandle = async () => {
    if (handled) return;
    if (!parsedHead) {
      const index = buffer.indexOf(HEADER_BREAK);
      if (index === -1) return;
      parsedHead = parseHeaders(buffer.slice(0, index).toString('utf8'));
      headerSize = index + HEADER_BREAK.length;
      if (headerValue(parsedHead.headers, 'expect').toLowerCase().includes('100-continue')) {
        socket.write('HTTP/1.1 100 Continue\r\n\r\n');
      }
    }

    const contentLength = Number(headerValue(parsedHead.headers, 'content-length') || '0');
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      handled = true;
      await writeAll(socket, httpResponse(400, 'Bad Request', { 'Content-Type': 'text/plain' }, 'Bad length'));
      socket.end();
      return;
    }
    if (contentLength > MAX_UPLOAD_BYTES) {
      handled = true;
      await writeAll(socket, httpResponse(413, 'Payload Too Large', { 'Content-Type': 'text/plain' }, 'Too large'));
      socket.end();
      return;
    }

    if (buffer.length < headerSize + contentLength) return;

    handled = true;
    const [path, queryString = ''] = parsedHead.path.split('?');
    const request: ParsedRequest = {
      method: parsedHead.method,
      path,
      query: new URLSearchParams(queryString),
      headers: parsedHead.headers,
      body: buffer.slice(headerSize, headerSize + contentLength),
    };

    inflight += 1;
    try {
      const response = await handleRequest(request, pin, normalizeClientIp(socket.remoteAddress));
      if (isStreamResult(response)) {
        await writeAll(socket, response.head);
        await streamFileRange(response.uri, response.start, response.end, (chunk) => writeAll(socket, chunk));
      } else {
        await writeAll(socket, response);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Server error';
      await writeAll(socket, httpResponse(500, 'Internal Server Error', { 'Content-Type': 'text/plain' }, message));
    } finally {
      inflight = Math.max(0, inflight - 1);
      socket.end();
    }
  };

  socket.on('data', (data) => {
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data, 'binary');
    buffer = concat(buffer, chunk);
    void maybeHandle();
  });
  socket.on('error', () => {
    activeSockets.delete(socket);
    socket.destroy();
  });
  socket.on('close', () => {
    activeSockets.delete(socket);
  });
}

export function isHosting(): boolean {
  return server !== null;
}

export function getHostPin(): string {
  return currentPin;
}

export type StartOptions = {
  /** Auto-restart after the app returned to the foreground: keep the PIN and this share's sessions. */
  resume?: boolean;
  /** Bonjour/mDNS name (only advertised when the native kc-background module is in the build). */
  bonjourName?: string;
};

export async function startLanServer(options: StartOptions = {}): Promise<string> {
  purgeTrash();
  if (server && !serverBroken) {
    return currentPin;
  }
  if (server && serverBroken) {
    await stopLanServer({ keepSessions: true });
  }
  if (!options.resume) resetLanAccess();
  currentPin = pinForStart(!!options.resume);
  shareState = 'awake';
  serverBroken = false;
  const pin = currentPin;
  const next = TcpSocket.createServer((socket) => {
    attachSocket(socket, pin);
  });
  server = next;

  try {
    await new Promise<void>((resolve, reject) => {
      next.once('error', reject);
      next.listen({ port: LAN_PORT, host: '0.0.0.0', reuseAddress: true }, () => {
        resolve();
      });
    });
  } catch (error) {
    server = null;
    currentPin = '';
    throw error;
  }
  next.on('error', () => {
    if (server !== next) return;
    serverBroken = true;
    notifyServer();
  });
  next.on('close', () => {
    if (server !== next) return;
    serverBroken = true;
    notifyServer();
  });
  publishBonjour(options.bonjourName || 'Music Player', LAN_PORT, { id: getDeviceId(), api: String(LAN_API_VERSION) });
  notifyServer();
  return pin;
}

export type StopOptions = {
  /** Going to sleep (background): keep sessions so the same pairing works after the auto-restart. */
  keepSessions?: boolean;
};

export async function stopLanServer(options: StopOptions = {}): Promise<void> {
  const active = server;
  server = null;
  currentPin = '';
  shareState = 'awake';
  serverBroken = false;
  if (!options.keepSessions) resetLanAccess();
  unpublishBonjour();
  for (const socket of activeSockets) {
    socket.destroy();
  }
  activeSockets.clear();
  inflight = 0;
  notifyServer();
  if (!active) return;
  await new Promise<void>((resolve) => {
    active.close(() => resolve());
    setTimeout(resolve, 500);
  });
}
