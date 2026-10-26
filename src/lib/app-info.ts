import Constants from 'expo-constants';

// What this build can do over LAN (reported to the dashboard so it can tell old builds apart).
export const LAN_FEATURES = ['pairing', 'background', 'resume', 'token-only', 'delete-grant', 'app-trash', 'upload', 'app-info', 'changelog', 'calendar', 'reminders'];

export type AppInfo = {
  version: string;
  build: string;
  commit: string;
  dirty: boolean;
  builtAt: string;
  features: string[];
};

type BuildInfo = { commit?: string; dirty?: boolean; builtAt?: string };

export function getAppInfo(): AppInfo {
  const cfg = Constants.expoConfig;
  const info = ((cfg?.extra as { buildInfo?: BuildInfo } | undefined)?.buildInfo ?? {}) as BuildInfo;
  const build = cfg?.ios?.buildNumber ?? (cfg?.android?.versionCode != null ? String(cfg.android.versionCode) : '');
  return {
    version: cfg?.version ?? '?',
    build: String(build ?? ''),
    commit: info.commit ?? '',
    dirty: !!info.dirty,
    builtAt: info.builtAt ?? '',
    features: [...LAN_FEATURES],
  };
}

export function formatBuildTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// "v1.0.1 (2) · abc1234-dirty · 2026-10-26 19:10"
export function appInfoLine(info: AppInfo = getAppInfo()): string {
  return [
    `v${info.version}${info.build ? ` (${info.build})` : ''}`,
    info.commit ? info.commit + (info.dirty ? '-dirty' : '') : '',
    formatBuildTime(info.builtAt),
  ]
    .filter(Boolean)
    .join(' · ');
}
