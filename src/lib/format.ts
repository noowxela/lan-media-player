export function formatTime(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function displayNameFromPath(name: string): string {
  let base = name.replace(/\\/g, '/').split('/').pop()?.trim() || '';
  try {
    base = decodeURIComponent(base);
  } catch {
    // Keep the raw name when it is not percent-encoded.
  }
  return base.normalize('NFC');
}

export function titleFromFilename(filename: string): string {
  const base = displayNameFromPath(filename).replace(/\.mp3$/i, '');
  return base.replace(/_+/g, ' ').trim() || 'Untitled';
}

export function sanitizeStoredFilename(name: string, fallback = 'file'): string {
  const base = displayNameFromPath(name) || fallback;
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/^\.+/u, '')
    .trim();
  return cleaned || fallback;
}

export function sanitizeFilename(name: string): string {
  const withExt = sanitizeStoredFilename(name, 'track.mp3');
  return withExt.toLowerCase().endsWith('.mp3') ? withExt : `${withExt}.mp3`;
}
