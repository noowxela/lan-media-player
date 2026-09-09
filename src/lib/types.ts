export type Track = {
  id: string;
  filename: string;
  title: string;
  artist?: string;
  duration?: number;
  addedAt: number;
};

export type RemoteTrack = {
  filename: string;
  title: string;
  size: number;
  artist?: string;
  duration?: number;
  format?: string;
};
