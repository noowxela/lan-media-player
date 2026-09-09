import { Directory, File, Paths } from 'expo-file-system';

import { sanitizeFilename, titleFromFilename } from '@/lib/format';
import type { Track } from '@/lib/types';

const INDEX_NAME = 'library.json';

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeLibrary(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyLibraryChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function musicDir(): Directory {
  return new Directory(Paths.document, 'music');
}

export function ensureMusicDir(): Directory {
  const dir = musicDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

export function getTrackFile(track: Track): File {
  return new File(musicDir(), track.filename);
}

export function getTrackUri(track: Track): string {
  return getTrackFile(track).uri;
}

export function getLibraryFolderUri(): string {
  return ensureMusicDir().uri;
}

export function listStoredMp3Files(): { filename: string; size: number }[] {
  const dir = ensureMusicDir();
  if (!dir.exists) return [];
  const files: { filename: string; size: number }[] = [];
  for (const item of dir.list()) {
    const name = item.name;
    if (!name.toLowerCase().endsWith('.mp3')) continue;
    const file = item instanceof File ? item : new File(dir, name);
    files.push({ filename: name, size: file.exists ? file.size : 0 });
  }
  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}

function indexFile(): File {
  return new File(ensureMusicDir(), INDEX_NAME);
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueFilename(dir: Directory, name: string): string {
  let candidate = name;
  let i = 2;
  while (new File(dir, candidate).exists) {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    candidate = `${stem}-${i}${ext}`;
    i += 1;
  }
  return candidate;
}

export async function loadTracks(): Promise<Track[]> {
  const file = indexFile();
  if (!file.exists) {
    return [];
  }
  try {
    const parsed = JSON.parse(file.textSync()) as Track[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((track) => new File(musicDir(), track.filename).exists);
  } catch {
    return [];
  }
}

export async function saveTracks(tracks: Track[]): Promise<void> {
  const file = indexFile();
  if (!file.exists) {
    file.create();
  }
  file.write(JSON.stringify(tracks, null, 2));
}

export async function importFromUris(
  assets: { uri: string; name?: string | null }[],
): Promise<Track[]> {
  const dir = ensureMusicDir();
  const tracks = await loadTracks();
  const added: Track[] = [];

  for (const asset of assets) {
    const originalName = asset.name || 'track.mp3';
    const filename = uniqueFilename(dir, sanitizeFilename(originalName));
    const dest = new File(dir, filename);
    const source = new File(asset.uri);
    await source.copy(dest, { overwrite: true });
    const track: Track = {
      id: newId(),
      filename,
      title: titleFromFilename(originalName),
      addedAt: Date.now(),
    };
    tracks.push(track);
    added.push(track);
  }

  await saveTracks(tracks);
  notifyLibraryChanged();
  return added;
}

export async function addTrackFromBytes(originalName: string, data: Uint8Array): Promise<Track> {
  const dir = ensureMusicDir();
  const filename = uniqueFilename(dir, sanitizeFilename(originalName));
  const dest = new File(dir, filename);
  if (!dest.exists) {
    dest.create();
  }
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  dest.write(bytes);
  const tracks = await loadTracks();
  const track: Track = {
    id: newId(),
    filename,
    title: titleFromFilename(originalName),
    addedAt: Date.now(),
  };
  tracks.push(track);
  await saveTracks(tracks);
  notifyLibraryChanged();
  return track;
}

export async function deleteTracks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const tracks = await loadTracks();
  for (const track of tracks) {
    if (!idSet.has(track.id)) continue;
    const file = getTrackFile(track);
    if (file.exists) {
      file.delete();
    }
  }
  await saveTracks(tracks.filter((track) => !idSet.has(track.id)));
  notifyLibraryChanged();
}

export async function deleteTrack(id: string): Promise<void> {
  await deleteTracks([id]);
}

export async function deleteTracksByFilenames(filenames: string[]): Promise<void> {
  if (filenames.length === 0) return;
  const nameSet = new Set(filenames);
  const tracks = await loadTracks();
  await deleteTracks(tracks.filter((track) => nameSet.has(track.filename)).map((track) => track.id));
}

export async function updateTrackDuration(id: string, duration: number): Promise<void> {
  const tracks = await loadTracks();
  const next = tracks.map((track) => (track.id === id ? { ...track, duration } : track));
  await saveTracks(next);
}
