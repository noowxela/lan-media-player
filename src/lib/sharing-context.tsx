import * as Device from 'expo-device';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Network from 'expo-network';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';

import { beginBackgroundTask, endBackgroundTask, hasBackgroundTask } from '../../modules/kc-background';
import { hostBaseUrl } from '@/lib/lan-client';
import {
  disconnectClient,
  getConnectedClients,
  getPendingAccessClients,
  resolveAccessRequest,
  revokeDevice,
  subscribeLanAccess,
  type AccessClient,
} from '@/lib/lan-access';
import {
  getPairedDevices,
  getSharingSettings,
  revokeAllPaired,
  rotatePin as rotateStoredPin,
  setSharingSetting,
  subscribePairing,
  type PairedDevice,
  type SharingSettings,
} from '@/lib/lan-pairing';
import {
  LAN_PORT,
  isHosting,
  isServerBroken,
  setShareState,
  startLanServer,
  stopLanServer,
  subscribeLanServer,
  waitForIdle,
} from '@/lib/lan-server';
import {
  getActiveDeleteGrants,
  getPendingDeleteGrants,
  resolveDeleteGrant,
  revokeAllDeleteGrants,
  subscribeDeleteGrants,
} from '@/lib/lan-delete-grant';
import { ensurePhotoPermission } from '@/lib/photos';
import { useMusic } from '@/lib/player-context';

const silenceSource = require('../../assets/sounds/silence.wav');

/**
 * App-level LAN share (was local state of the Transfer tab, so leaving the tab or locking the phone killed it).
 *
 *   off       not sharing
 *   on        server running (foreground, or background while audio keeps the app alive)
 *   sleeping  app went to the background with nothing playing: finishing in-flight transfers (iOS grace time,
 *             max ~25 s), new requests get 503 "Sleeping" so the dashboard shows 手机休眠中
 *   paused    server stopped for the background; restarts automatically with the SAME PIN and pairings when the
 *             app is opened again
 */
export type SharePhase = 'off' | 'starting' | 'on' | 'sleeping' | 'paused';

type SharingValue = {
  phase: SharePhase;
  pin: string;
  ip: string;
  shareUrl: string;
  error: string;
  connected: AccessClient[];
  paired: PairedDevice[];
  settings: SharingSettings;
  /** true when the native background-task module is in this build (otherwise iOS suspends after ~5 s). */
  hasGraceTime: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  disconnect: (id: string) => void;
  revoke: (token: string) => void;
  revokeAll: () => void;
  /** clients currently allowed to delete music / Documents (one approval per connection, 30 min idle expiry). */
  deleteGrants: { token: string; name: string; grantedAt: number; expiresAt: number }[];
  revokeDeleteGrants: () => void;
  rotatePin: () => Promise<void>;
  setSetting: <K extends keyof SharingSettings>(key: K, value: SharingSettings[K]) => void;
};

const SharingContext = createContext<SharingValue | null>(null);

const DRAIN_MAX_MS = 25_000; // iOS gives ~30 s of background time; keep a margin
const SLEEP_NOTICE_MS = 4_000; // keep answering "sleeping" this long so a polling dashboard notices
const RESTART_AFTER_BACKGROUND_MS = 8_000; // longer than this without keep-alive → listener may be dead, restart

export function SharingProvider({ children }: { children: ReactNode }) {
  const { isPlaying } = useMusic();
  const [phase, setPhase] = useState<SharePhase>('off');
  const [pin, setPin] = useState('');
  const [ip, setIp] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState<AccessClient[]>([]);
  const [paired, setPaired] = useState<PairedDevice[]>(() => getPairedDevices());
  const [settings, setSettings] = useState<SharingSettings>(() => getSharingSettings());

  const wantSharing = useRef(false);
  const phaseRef = useRef<SharePhase>('off');
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundAt = useRef(0);
  const keptAliveSinceBackground = useRef(true);
  const sleepRun = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  const settingsRef = useRef(settings);
  const silent = useRef<AudioPlayer | null>(null);
  isPlayingRef.current = isPlaying;
  settingsRef.current = settings;

  const setPhaseBoth = useCallback((next: SharePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // ---------------------------------------------------------------- silent keep-alive (opt-in)
  const silentWanted = () =>
    wantSharing.current && settingsRef.current.keepAliveSilent && !isPlayingRef.current;
  const syncSilent = useCallback(() => {
    if (silentWanted()) {
      if (!silent.current) {
        silent.current = createAudioPlayer(silenceSource, { keepAudioSessionActive: true });
        silent.current.loop = true;
      }
      if (!silent.current.playing) silent.current.play();
    } else if (silent.current) {
      silent.current.pause();
      if (!wantSharing.current) {
        silent.current.remove();
        silent.current = null;
      }
    }
  }, []);
  const keepAliveActive = () =>
    isPlayingRef.current || (settingsRef.current.keepAliveSilent && !!silent.current?.playing);

  // ---------------------------------------------------------------- start / stop
  const refreshIp = useCallback(async () => {
    try {
      setIp(await Network.getIpAddressAsync());
    } catch {
      // keep the last one
    }
  }, []);

  const boot = useCallback(
    async (resume: boolean) => {
      const nextPin = await startLanServer({
        resume,
        bonjourName: Device.deviceName || Device.modelName || 'Music Player',
      });
      setPin(nextPin);
      await refreshIp();
      setPhaseBoth('on');
      setShareState('awake');
      syncSilent();
    },
    [refreshIp, setPhaseBoth, syncSilent],
  );

  const start = useCallback(async () => {
    if (phaseRef.current === 'starting') return;
    setError('');
    setPhaseBoth('starting');
    wantSharing.current = true;
    try {
      const photosOk = await ensurePhotoPermission();
      await boot(false);
      await activateKeepAwakeAsync('lan-host');
      if (!photosOk) {
        setError('Sharing started. Allow Photos access to browse photos and videos from the browser.');
      }
    } catch (e) {
      wantSharing.current = false;
      setPhaseBoth('off');
      setError(e instanceof Error ? e.message : 'Could not start sharing');
    }
  }, [boot, setPhaseBoth]);

  const stop = useCallback(async () => {
    wantSharing.current = false;
    sleepRun.current += 1;
    await stopLanServer();
    deactivateKeepAwake('lan-host');
    syncSilent();
    setPin('');
    setPhaseBoth('off');
  }, [setPhaseBoth, syncSilent]);

  // ---------------------------------------------------------------- background / foreground
  const sleepIfIdle = useCallback(async () => {
    if (!wantSharing.current || phaseRef.current !== 'on') return;
    if (appState.current === 'active' || keepAliveActive()) return;
    const run = ++sleepRun.current;
    keptAliveSinceBackground.current = false;
    setPhaseBoth('sleeping');
    setShareState('sleeping');
    let expired = false;
    const task = await beginBackgroundTask('lan-share-drain', () => {
      expired = true;
    });
    const cancelled = () => run !== sleepRun.current || appState.current === 'active' || keepAliveActive();
    const began = Date.now();
    await waitForIdle(DRAIN_MAX_MS, () => expired || cancelled());
    while (!expired && !cancelled() && Date.now() - began < SLEEP_NOTICE_MS) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (cancelled() && run === sleepRun.current && wantSharing.current) {
      // back in the foreground (or music started again) before we stopped: just wake up
      setShareState('awake');
      setPhaseBoth('on');
      keptAliveSinceBackground.current = true;
      await endBackgroundTask(task);
      return;
    }
    if (run !== sleepRun.current) {
      await endBackgroundTask(task);
      return;
    }
    // still busy after the drain window → stop anyway; the dashboard resumes/retries the file later
    await stopLanServer({ keepSessions: true });
    setPhaseBoth('paused');
    await endBackgroundTask(task);
  }, [setPhaseBoth]);

  const wake = useCallback(async () => {
    if (!wantSharing.current) return;
    sleepRun.current += 1; // cancels a running sleepIfIdle
    const away = backgroundAt.current ? Date.now() - backgroundAt.current : 0;
    const needRestart =
      phaseRef.current === 'paused' ||
      !isHosting() ||
      isServerBroken() ||
      (!keptAliveSinceBackground.current && away > RESTART_AFTER_BACKGROUND_MS);
    try {
      if (needRestart) {
        await stopLanServer({ keepSessions: true });
        await boot(true); // same PIN + same sessions/pairings → the dashboard reconnects by itself
      } else {
        setShareState('awake');
        setPhaseBoth('on');
        await refreshIp();
      }
      await activateKeepAwakeAsync('lan-host');
    } catch (e) {
      setError(e instanceof Error ? `Could not resume sharing: ${e.message}` : 'Could not resume sharing');
    }
  }, [boot, refreshIp, setPhaseBoth]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appState.current;
      appState.current = next;
      if (next === 'background') {
        backgroundAt.current = Date.now();
        keptAliveSinceBackground.current = keepAliveActive();
        void sleepIfIdle();
      } else if (next === 'active' && prev !== 'active') {
        void wake();
      }
    });
    return () => sub.remove();
  }, [sleepIfIdle, wake]);

  // music stopped while the phone is locked → start the drain; music started → keep alive
  useEffect(() => {
    syncSilent();
    if (appState.current === 'background' && !isPlaying) void sleepIfIdle();
  }, [isPlaying, sleepIfIdle, syncSilent]);

  useEffect(() => {
    syncSilent();
  }, [settings.keepAliveSilent, syncSilent]);

  // the listening socket died (iOS reclaimed it): restart right away when we are in the foreground
  useEffect(() => {
    return subscribeLanServer(() => {
      if (isServerBroken() && wantSharing.current && appState.current === 'active') void wake();
    });
  }, [wake]);

  useEffect(() => {
    const sub = Network.addNetworkStateListener(() => {
      if (wantSharing.current) void refreshIp();
    });
    return () => sub.remove();
  }, [refreshIp]);

  // ---------------------------------------------------------------- access prompts (any tab)
  useEffect(() => {
    let lastPromptedId = '';
    const sync = () => {
      setConnected(getConnectedClients());
      const next = getPendingAccessClients()[0];
      if (!next || next.id === lastPromptedId) return;
      lastPromptedId = next.id;
      const who = next.name ? `${next.name} (${next.ip})` : next.ip;
      Alert.alert(
        'Permission',
        next.wantsPair
          ? `${who} requests connection and wants to be remembered (auto-connect next time, no PIN).`
          : `${who} requests connection?`,
        [
          { text: 'Decline', style: 'cancel', onPress: () => resolveAccessRequest(next.id, false) },
          { text: next.wantsPair ? 'Accept & remember' : 'Accept', onPress: () => resolveAccessRequest(next.id, true) },
        ],
        { cancelable: false },
      );
    };
    sync();
    return subscribeLanAccess(sync);
  }, []);

  // ---------------------------------------------------------------- delete grant prompt: once per connection
  const [deleteGrants, setDeleteGrants] = useState(() => getActiveDeleteGrants());
  useEffect(() => {
    let lastPromptedId = '';
    const sync = () => {
      setDeleteGrants(getActiveDeleteGrants());
      const next = getPendingDeleteGrants()[0];
      if (!next || next.id === lastPromptedId) return;
      lastPromptedId = next.id;
      Alert.alert(
        'Allow deletes?',
        `${next.name} (${next.ip}) wants to delete music / files on this phone. Allow for this connection? You won't be asked again until it has been disconnected for more than 30 minutes. Deleted files are kept in the app's trash for 30 days.`,
        [
          { text: "Don't allow", style: 'cancel', onPress: () => resolveDeleteGrant(next.id, false) },
          { text: 'Allow for this connection', onPress: () => resolveDeleteGrant(next.id, true) },
        ],
        { cancelable: false },
      );
    };
    sync();
    const timer = setInterval(() => setDeleteGrants(getActiveDeleteGrants()), 60_000); // expiries
    const unsub = subscribeDeleteGrants(sync);
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, []);

  useEffect(() => {
    return subscribePairing(() => {
      setPaired(getPairedDevices());
      setSettings(getSharingSettings());
    });
  }, []);

  useEffect(() => {
    return () => {
      silent.current?.remove();
      silent.current = null;
    };
  }, []);

  const value = useMemo<SharingValue>(
    () => ({
      phase,
      pin,
      ip,
      shareUrl: pin && ip ? `${hostBaseUrl(ip, LAN_PORT)}?pin=${pin}` : '',
      error,
      connected,
      paired,
      settings,
      hasGraceTime: hasBackgroundTask(),
      start,
      stop,
      disconnect: (id) => disconnectClient(id),
      revoke: (token) => revokeDevice(token),
      revokeAll: () => {
        for (const device of getPairedDevices()) revokeDevice(device.token);
        revokeAllPaired();
      },
      rotatePin: async () => {
        rotateStoredPin();
        if (wantSharing.current) {
          await stopLanServer({ keepSessions: true });
          await boot(true);
        }
      },
      setSetting: (key, val) => setSharingSetting(key, val),
      deleteGrants,
      revokeDeleteGrants: () => revokeAllDeleteGrants(),
    }),
    [phase, pin, ip, error, connected, paired, settings, start, stop, boot, deleteGrants],
  );

  return <SharingContext.Provider value={value}>{children}</SharingContext.Provider>;
}

export function useSharing(): SharingValue {
  const value = useContext(SharingContext);
  if (!value) throw new Error('useSharing must be used inside SharingProvider');
  return value;
}
