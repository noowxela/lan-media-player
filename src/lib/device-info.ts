import * as Device from 'expo-device';
import { Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { loadTracks } from '@/lib/library';
import { countPhotos, countVideos } from '@/lib/photos';

export type ShareDeviceInfo = {
  name: string;
  os: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  counts: {
    photos: number;
    videos: number;
    music: number;
    documents: number;
  };
};

export async function getShareDeviceInfo(): Promise<ShareDeviceInfo> {
  const tracks = await loadTracks();
  const totalBytes = Number(Paths.totalDiskSpace) || 0;
  const freeBytes = Number(Paths.availableDiskSpace) || 0;
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const isIos = Platform.OS === 'ios';

  return {
    name: isIos ? 'iPhone' : Device.modelName || 'Android',
    os: `${isIos ? 'iOS' : 'Android'} ${Device.osVersion ?? ''}`.trim(),
    totalBytes,
    freeBytes,
    usedBytes,
    counts: {
      photos: await countPhotos(),
      videos: await countVideos(),
      music: tracks.length,
      documents: 0,
    },
  };
}
