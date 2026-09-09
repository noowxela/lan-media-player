import { Buffer } from 'buffer';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';

export class PhotosPermissionError extends Error {
  constructor() {
    super('Photo library permission is required');
    this.name = 'PhotosPermissionError';
  }
}

export type MediaKind = 'photo' | 'video';

export type PhotoAlbumInfo = {
  id: string;
  title: string;
  count: number;
  coverId: string | null;
};

export type PhotoAssetInfo = {
  id: string;
  filename: string;
  createdAt: number;
  width: number;
  height: number;
  duration: number;
};

export type PhotoPage = {
  assets: PhotoAssetInfo[];
  endCursor: string | null;
  hasNextPage: boolean;
  totalCount: number;
};

const RECENTS_ID = 'recents';
export const CAMERA_ID = 'camera';
const PAGE_SIZE = 80;
const THUMB_WIDTH = 400;

function nativeType(kind: MediaKind) {
  return kind === 'video' ? MediaLibrary.MediaType.video : MediaLibrary.MediaType.photo;
}

export async function ensurePhotoPermission(): Promise<boolean> {
  const current = await MediaLibrary.getPermissionsAsync();
  if (current.granted) return true;
  const next = await MediaLibrary.requestPermissionsAsync();
  return next.granted;
}

async function requirePermission(): Promise<void> {
  const ok = await ensurePhotoPermission();
  if (!ok) throw new PhotosPermissionError();
}

function thumbDir(kind: MediaKind): Directory {
  const dir = new Directory(Paths.cache, kind === 'video' ? 'video-thumbs' : 'photo-thumbs');
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function thumbFile(kind: MediaKind, id: string): File {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new File(thumbDir(kind), `${safe}.jpg`);
}

function toAssetInfo(asset: MediaLibrary.Asset): PhotoAssetInfo {
  return {
    id: asset.id,
    filename: asset.filename,
    createdAt: asset.creationTime,
    width: asset.width,
    height: asset.height,
    duration: asset.duration || 0,
  };
}

function isCameraTitle(title: string): boolean {
  return /^(camera|camera roll|相机胶卷|相機膠卷|相机|相機)$/i.test(title.trim());
}

function isRecentsTitle(title: string): boolean {
  return /^(recents|all photos|all videos|最近项目|最近項目)$/i.test(title.trim());
}

export async function countMedia(kind: MediaKind): Promise<number> {
  try {
    await requirePermission();
    const page = await MediaLibrary.getAssetsAsync({
      first: 1,
      mediaType: nativeType(kind),
    });
    return page.totalCount;
  } catch {
    return 0;
  }
}

export async function countPhotos(): Promise<number> {
  return countMedia('photo');
}

export async function countVideos(): Promise<number> {
  return countMedia('video');
}

export async function listMediaAlbums(kind: MediaKind): Promise<PhotoAlbumInfo[]> {
  await requirePermission();
  const recentsPage = await MediaLibrary.getAssetsAsync({
    first: 1,
    mediaType: nativeType(kind),
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  const extras: PhotoAlbumInfo[] = [];

  for (const album of albums) {
    if (!album.assetCount) continue;
    const page = await MediaLibrary.getAssetsAsync({
      album,
      first: 1,
      mediaType: nativeType(kind),
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    if (page.totalCount === 0) continue;
    extras.push({
      id: album.id,
      title: album.title,
      count: page.totalCount,
      coverId: page.assets[0]?.id ?? null,
    });
  }

  extras.sort((a, b) => {
    const cam = Number(isCameraTitle(b.title)) - Number(isCameraTitle(a.title));
    if (cam !== 0) return cam;
    return a.title.localeCompare(b.title);
  });

  return [
    {
      id: RECENTS_ID,
      title: 'Recents',
      count: recentsPage.totalCount,
      coverId: recentsPage.assets[0]?.id ?? null,
    },
    ...extras.filter((album) => album.id !== RECENTS_ID && !isRecentsTitle(album.title)),
  ];
}

async function resolveAlbumId(albumId?: string): Promise<string | undefined | null> {
  if (!albumId || albumId === RECENTS_ID) return undefined;
  if (albumId !== CAMERA_ID) return albumId;
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  const camera = albums.find((album) => isCameraTitle(album.title));
  return camera?.id ?? null;
}

export async function listPhotoAlbums(): Promise<PhotoAlbumInfo[]> {
  return listMediaAlbums('photo');
}

export async function listVideoAlbums(): Promise<PhotoAlbumInfo[]> {
  return listMediaAlbums('video');
}

export async function listMedia(kind: MediaKind, albumId?: string, after?: string): Promise<PhotoPage> {
  await requirePermission();
  const resolved = await resolveAlbumId(albumId);
  if (resolved === null) {
    return { assets: [], endCursor: null, hasNextPage: false, totalCount: 0 };
  }
  const page = await MediaLibrary.getAssetsAsync({
    first: PAGE_SIZE,
    after: after || undefined,
    album: resolved,
    mediaType: nativeType(kind),
    sortBy: [[MediaLibrary.SortBy.creationTime, false]],
  });
  return {
    assets: page.assets.map(toAssetInfo),
    endCursor: page.hasNextPage ? page.endCursor : null,
    hasNextPage: page.hasNextPage,
    totalCount: page.totalCount,
  };
}

export async function listPhotos(albumId?: string, after?: string): Promise<PhotoPage> {
  return listMedia('photo', albumId, after);
}

export async function listVideos(albumId?: string, after?: string): Promise<PhotoPage> {
  return listMedia('video', albumId, after);
}

async function localAssetUri(id: string): Promise<{ uri: string; filename: string }> {
  await requirePermission();
  const info = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: true });
  const uri = info.localUri || info.uri;
  if (!uri) {
    throw new Error('Media file is not available');
  }
  return { uri, filename: info.filename };
}

async function jpegFileFromUri(uri: string, width: number, compress: number): Promise<File> {
  const result = await manipulateAsync(uri, [{ resize: { width } }], {
    compress,
    format: SaveFormat.JPEG,
  });
  return new File(result.uri);
}

async function storeThumb(kind: MediaKind, id: string, source: File): Promise<Buffer> {
  const cached = thumbFile(kind, id);
  try {
    await source.copy(cached, { overwrite: true });
    if (cached.exists) return Buffer.from(await cached.bytes());
  } catch {
    // Serving the JPEG still works if the cache write fails.
  }
  return Buffer.from(await source.bytes());
}

export async function getPhotoThumbBytes(id: string): Promise<Buffer> {
  const cached = thumbFile('photo', id);
  if (cached.exists) {
    return Buffer.from(await cached.bytes());
  }
  const { uri } = await localAssetUri(id);
  return storeThumb('photo', id, await jpegFileFromUri(uri, THUMB_WIDTH, 0.7));
}

export async function getVideoThumbBytes(id: string): Promise<Buffer> {
  const cached = thumbFile('video', id);
  if (cached.exists) {
    return Buffer.from(await cached.bytes());
  }
  const { uri } = await localAssetUri(id);
  const shot = await VideoThumbnails.getThumbnailAsync(uri, { time: 0, quality: 0.6 });
  return storeThumb('video', id, await jpegFileFromUri(shot.uri, THUMB_WIDTH, 0.7));
}

function photoContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  return 'image/jpeg';
}

function videoContentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.m4v')) return 'video/x-m4v';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.3gp')) return 'video/3gpp';
  return 'video/mp4';
}

export async function getPhotoOriginal(id: string): Promise<{ bytes: Buffer; filename: string; contentType: string }> {
  const { uri, filename } = await localAssetUri(id);
  return {
    bytes: Buffer.from(await new File(uri).bytes()),
    filename,
    contentType: photoContentType(filename),
  };
}

export type VideoFileInfo = {
  uri: string;
  filename: string;
  contentType: string;
  size: number;
};

export async function getVideoFileInfo(id: string): Promise<VideoFileInfo> {
  const { uri, filename } = await localAssetUri(id);
  const file = new File(uri);
  let size = Number(file.size) || 0;
  if (size <= 0 && file.exists) {
    const handle = file.open(FileMode.ReadOnly);
    try {
      size = Number(handle.size) || 0;
    } finally {
      handle.close();
    }
  }
  if (!file.exists || size <= 0) {
    throw new Error('Video file is not available');
  }
  return { uri, filename, contentType: videoContentType(filename), size };
}

export function readFileRange(uri: string, start: number, length: number): Buffer {
  const file = new File(uri);
  const handle = file.open(FileMode.ReadOnly);
  try {
    handle.offset = start;
    return Buffer.from(handle.readBytes(length));
  } finally {
    handle.close();
  }
}

export async function streamFileRange(
  uri: string,
  start: number,
  end: number,
  write: (chunk: Buffer) => Promise<void>,
): Promise<void> {
  const file = new File(uri);
  const handle = file.open(FileMode.ReadOnly);
  try {
    handle.offset = start;
    let remaining = Math.max(0, end - start + 1);
    while (remaining > 0) {
      const n = Math.min(256 * 1024, remaining);
      const chunk = handle.readBytes(n);
      if (!chunk.byteLength) break;
      await write(Buffer.from(chunk));
      remaining -= chunk.byteLength;
    }
  } finally {
    handle.close();
  }
}

export async function getPhotoPreviewJpeg(id: string): Promise<Buffer> {
  const { uri } = await localAssetUri(id);
  return Buffer.from(await (await jpegFileFromUri(uri, 1600, 0.82)).bytes());
}

export async function deleteLibraryAssets(ids: string[]): Promise<boolean> {
  await requirePermission();
  if (ids.length === 0) return true;
  const deleted = await MediaLibrary.deleteAssetsAsync(ids);
  if (deleted) {
    for (const id of ids) {
      for (const kind of ['photo', 'video'] as const) {
        const cached = thumbFile(kind, id);
        if (cached.exists) cached.delete();
      }
    }
  }
  return deleted;
}

export async function deletePhotos(ids: string[]): Promise<boolean> {
  return deleteLibraryAssets(ids);
}
