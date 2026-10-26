import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * JS side of the local `KcBackground` module (modules/kc-background/ios). The module only exists in a build made
 * after it was added (`npx expo run:ios`). Before that every function here is a safe no-op, so a JS-only reload
 * still works — just without the background grace time and Bonjour.
 */
type Events = {
  onExpire: (event: { id: number }) => void;
};

declare class KcBackgroundNative extends NativeModule<Events> {
  begin(name: string): Promise<number>;
  end(id: number): Promise<void>;
  remaining(): Promise<number>;
  publish(name: string, type: string, port: number, txt: Record<string, string>): Promise<void>;
  unpublish(): Promise<void>;
}

const native = requireOptionalNativeModule<KcBackgroundNative>('KcBackground');

export const BONJOUR_TYPE = '_kcphone._tcp.';

export function hasBackgroundTask(): boolean {
  return !!native;
}

/**
 * Asks iOS for extra background run time. Resolves to a handle (0 = not available); `onExpire` runs if iOS
 * takes the time back before `endBackgroundTask` is called.
 */
export async function beginBackgroundTask(name: string, onExpire: () => void): Promise<number> {
  if (!native) return 0;
  try {
    const id = await native.begin(name);
    if (!id) return 0;
    const sub = native.addListener('onExpire', (event) => {
      if (event.id !== id) return;
      sub.remove();
      onExpire();
    });
    expiries.set(id, sub);
    return id;
  } catch {
    return 0;
  }
}

const expiries = new Map<number, { remove: () => void }>();

export async function endBackgroundTask(id: number): Promise<void> {
  if (!native || !id) return;
  expiries.get(id)?.remove();
  expiries.delete(id);
  try {
    await native.end(id);
  } catch {
    // already ended
  }
}

export async function backgroundTimeRemaining(): Promise<number> {
  if (!native) return -1;
  try {
    return await native.remaining();
  } catch {
    return -1;
  }
}

export function publishBonjour(name: string, port: number, txt: Record<string, string>): void {
  if (!native) return;
  void native.publish(name, BONJOUR_TYPE, port, txt).catch(() => undefined);
}

export function unpublishBonjour(): void {
  if (!native) return;
  void native.unpublish().catch(() => undefined);
}
