import { Directory, File, Paths } from 'expo-file-system';

import { sanitizeStoredFilename } from '@/lib/format';

export type SharedDocument = {
  filename: string;
  size: number;
};

export function documentsDir(): Directory {
  return new Directory(Paths.document, 'files');
}

export function ensureDocumentsDir(): Directory {
  const dir = documentsDir();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
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

export function listDocuments(): SharedDocument[] {
  const dir = ensureDocumentsDir();
  if (!dir.exists) return [];
  const files: SharedDocument[] = [];
  for (const item of dir.list()) {
    const name = item.name;
    if (!name || name.startsWith('.')) continue;
    const file = item instanceof File ? item : new File(dir, name);
    if (!file.exists) continue;
    files.push({ filename: name, size: file.exists ? file.size : 0 });
  }
  return files.sort((a, b) => a.filename.localeCompare(b.filename));
}

export function countDocuments(): number {
  return listDocuments().length;
}

export function getDocumentFile(filename: string): File {
  const safe = sanitizeStoredFilename(filename);
  if (!safe || safe === '.' || safe === '..' || safe.includes('/') || safe.includes('\\')) {
    throw new Error('Bad filename');
  }
  return new File(ensureDocumentsDir(), safe);
}

export async function addDocumentFromBytes(originalName: string, data: Uint8Array): Promise<SharedDocument> {
  const dir = ensureDocumentsDir();
  const filename = uniqueFilename(dir, sanitizeStoredFilename(originalName, 'file'));
  const dest = new File(dir, filename);
  if (!dest.exists) {
    dest.create();
  }
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  dest.write(bytes);
  return { filename, size: dest.size || data.byteLength };
}

export function deleteDocuments(filenames: string[]): number {
  let deleted = 0;
  for (const name of filenames) {
    try {
      const file = getDocumentFile(name);
      if (!file.exists) continue;
      file.delete();
      deleted += 1;
    } catch {
      // Skip unsafe names.
    }
  }
  return deleted;
}

export function contentTypeForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain; charset=utf-8';
    case 'csv':
      return 'text/csv';
    case 'json':
      return 'application/json';
    case 'zip':
      return 'application/zip';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'mp3':
      return 'audio/mpeg';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    default:
      return 'application/octet-stream';
  }
}
