// Release notes: ONE source of truth = ./changelog.json (newest first).
// docs/CHANGELOG.md is generated from it: `node scripts/changelog-md.js`.
import data from './changelog.json';

export type ChangelogEntry = {
  version: string;
  build: string;
  date: string;
  features: string[];
  fixes: string[];
  improvements: string[];
};

export const CHANGELOG: ChangelogEntry[] = data as ChangelogEntry[];

export function changelogFor(version: string): ChangelogEntry | undefined {
  return CHANGELOG.find((entry) => entry.version === version);
}

export const CHANGELOG_SECTIONS: { key: 'features' | 'fixes' | 'improvements'; label: string }[] = [
  { key: 'features', label: '新功能 · New' },
  { key: 'fixes', label: '修复 · Fixes' },
  { key: 'improvements', label: '改进 · Improvements' },
];
