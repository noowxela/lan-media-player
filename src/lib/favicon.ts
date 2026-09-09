import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Buffer } from 'buffer';

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e6f4fe"/><path d="M12.5 34.5 L24 14 L35.5 34.5" fill="none" stroke="#0072de" stroke-width="6.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function faviconMark(size: number): string {
  return FAVICON_SVG.replace(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">`,
  );
}

let faviconPng: Buffer | null = null;

export async function getFaviconPng(): Promise<Buffer> {
  if (faviconPng) return faviconPng;
  const asset = Asset.fromModule(require('../../assets/images/lan-favicon-256.png'));
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const bytes = await new File(uri).bytes();
  faviconPng = Buffer.from(bytes);
  return faviconPng;
}

