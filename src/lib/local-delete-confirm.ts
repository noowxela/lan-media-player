import { Alert } from 'react-native';

import { DELETE_GRANT_IDLE_MS } from '@/lib/lan-delete-grant';

// In-app deletes: ask once, then not again while the owner keeps deleting (same 30-min idle rule as LAN delete grants).
let okUntil = 0;

export function confirmLocalDelete(title: string, message: string, run: () => void): void {
  if (Date.now() < okUntil) {
    okUntil = Date.now() + DELETE_GRANT_IDLE_MS;
    run();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: run },
    {
      text: "Delete, don't ask again (30 min)",
      style: 'destructive',
      onPress: () => {
        okUntil = Date.now() + DELETE_GRANT_IDLE_MS;
        run();
      },
    },
  ]);
}
