import { File, Paths } from 'expo-file-system';

import { getAppInfo } from '@/lib/app-info';
import { changelogFor, type ChangelogEntry } from '@/lib/changelog';

// "What's new" after an update. The last version the owner has seen is kept in Documents/.last-seen-version.
// Builds before 1.0.1 never wrote this file, so "no file" = upgraded from an old build (or a fresh install):
// we show the sheet once in both cases (a fresh install just sees what the app can do), then never again
// until the version changes.
const seenFile = () => new File(Paths.document, '.last-seen-version');

export async function pendingWhatsNew(): Promise<ChangelogEntry | null> {
  const current = getAppInfo().version;
  let seen = '';
  try {
    const f = seenFile();
    if (f.exists) seen = f.textSync().trim();
  } catch {
    seen = '';
  }
  if (seen === current) return null;
  return changelogFor(current) ?? null;
}

export function markWhatsNewSeen(): void {
  try {
    const f = seenFile();
    if (!f.exists) f.create();
    f.write(getAppInfo().version);
  } catch {
    // best effort
  }
}
