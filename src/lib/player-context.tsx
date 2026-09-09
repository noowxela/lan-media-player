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
import { Alert } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';

const uploadDoneSound = require('../../assets/sounds/upload-done.wav');

import { subscribeIncomingUploads } from '@/lib/lan-server';

import {
  deleteTracks as removeTracks,
  getTrackUri,
  loadTracks,
  subscribeLibrary,
  updateTrackDuration,
  importFromUris,
} from '@/lib/library';
import type { Track } from '@/lib/types';

type MusicContextValue = {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoaded: boolean;
  currentTime: number;
  duration: number;
  loop: boolean;
  playTrack: (track: Track) => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seek: (seconds: number) => Promise<void>;
  setLoop: (value: boolean) => void;
  importTracks: () => Promise<void>;
  deleteTrack: (id: string) => Promise<void>;
  deleteTracks: (ids: string[]) => Promise<void>;
  refresh: () => Promise<void>;
};

const MusicContext = createContext<MusicContextValue | null>(null);

export function MusicProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const chime = useAudioPlayer(uploadDoneSound);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [loop, setLoopState] = useState(false);
  const tracksRef = useRef(tracks);
  const currentRef = useRef(currentTrack);
  const loopRef = useRef(loop);
  const handledFinishRef = useRef(false);

  tracksRef.current = tracks;
  currentRef.current = currentTrack;
  loopRef.current = loop;

  const refresh = useCallback(async () => {
    setTracks(await loadTracks());
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeLibrary(() => {
      void refresh();
    });
  }, [refresh]);

  useEffect(() => {
    if (!currentTrack) return;
    if (tracks.some((track) => track.id === currentTrack.id)) return;
    player.pause();
    setCurrentTrack(null);
    player.setActiveForLockScreen(false);
  }, [currentTrack, player, tracks]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    });
  }, []);

  useEffect(() => {
    return subscribeIncomingUploads(({ tracks: uploaded, failed }) => {
      if (uploaded.length === 0 && failed === 0) return;
      void chime.seekTo(0).then(() => {
        chime.play();
      });
      const title = uploaded.length <= 1 ? 'Upload complete' : 'Uploads complete';
      let message =
        uploaded.length === 0
          ? 'No files were added to your library.'
          : uploaded.length === 1
            ? `${uploaded[0].title} is now in your library.`
            : `${uploaded.length} MP3s are now in your library.`;
      if (failed > 0) {
        message += ` ${failed} failed.`;
      }
      Alert.alert(title, message);
    });
  }, [chime]);

  const playTrack = useCallback(
    (track: Track) => {
      handledFinishRef.current = false;
      setCurrentTrack(track);
      player.replace({ uri: getTrackUri(track) });
      player.loop = loopRef.current;
      player.play();
      player.setActiveForLockScreen(true, {
        title: track.title,
        artist: track.artist ?? 'Local file',
        albumTitle: 'Music Player',
      });
    },
    [player],
  );

  const playNext = useCallback(() => {
    const list = tracksRef.current;
    const current = currentRef.current;
    if (list.length === 0) return;
    const index = current ? list.findIndex((track) => track.id === current.id) : -1;
    const next = list[(index + 1) % list.length];
    if (next) playTrack(next);
  }, [playTrack]);

  const playPrevious = useCallback(() => {
    const list = tracksRef.current;
    const current = currentRef.current;
    if (list.length === 0) return;
    const index = current ? list.findIndex((track) => track.id === current.id) : 0;
    const previous = list[(index - 1 + list.length) % list.length];
    if (previous) playTrack(previous);
  }, [playTrack]);

  useEffect(() => {
    if (!status.didJustFinish) {
      handledFinishRef.current = false;
      return;
    }
    if (handledFinishRef.current || loopRef.current) return;
    handledFinishRef.current = true;
    playNext();
  }, [playNext, status.didJustFinish]);

  useEffect(() => {
    const current = currentRef.current;
    if (!current || !status.isLoaded || !status.duration) return;
    if (current.duration && Math.abs(current.duration - status.duration) < 0.5) return;
    void updateTrackDuration(current.id, status.duration);
  }, [status.duration, status.isLoaded, currentTrack?.id]);

  const togglePlay = useCallback(() => {
    if (!currentRef.current) {
      const first = tracksRef.current[0];
      if (first) playTrack(first);
      return;
    }
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [playTrack, player, status.playing]);

  const seek = useCallback(
    async (seconds: number) => {
      await player.seekTo(Math.max(0, seconds));
    },
    [player],
  );

  const setLoop = useCallback(
    (value: boolean) => {
      setLoopState(value);
      player.loop = value;
    },
    [player],
  );

  const importTracks = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/mpeg', 'audio/mp3'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    await importFromUris(result.assets);
  }, []);

  const deleteTracks = useCallback(
    async (ids: string[]) => {
      if (currentRef.current && ids.includes(currentRef.current.id)) {
        player.pause();
        setCurrentTrack(null);
        player.setActiveForLockScreen(false);
      }
      await removeTracks(ids);
    },
    [player],
  );

  const deleteTrack = useCallback(
    async (id: string) => {
      await deleteTracks([id]);
    },
    [deleteTracks],
  );

  const value = useMemo<MusicContextValue>(
    () => ({
      tracks,
      currentTrack,
      isPlaying: status.playing,
      isLoaded: status.isLoaded,
      currentTime: status.currentTime ?? 0,
      duration: status.duration ?? 0,
      loop,
      playTrack,
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setLoop,
      importTracks,
      deleteTrack,
      deleteTracks,
      refresh,
    }),
    [
      tracks,
      currentTrack,
      status.playing,
      status.isLoaded,
      status.currentTime,
      status.duration,
      loop,
      playTrack,
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setLoop,
      importTracks,
      deleteTrack,
      deleteTracks,
      refresh,
    ],
  );

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusic(): MusicContextValue {
  const value = useContext(MusicContext);
  if (!value) {
    throw new Error('useMusic must be used inside MusicProvider');
  }
  return value;
}
