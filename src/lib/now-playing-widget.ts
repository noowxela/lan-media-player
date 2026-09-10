import { Platform } from 'react-native';

import type { NowPlayingWidgetProps } from '../../widgets/NowPlayingWidget';

export type { NowPlayingWidgetProps };

export function pushNowPlayingWidget(props: NowPlayingWidgetProps): void {
  if (Platform.OS !== 'ios') return;
  try {
    // Load lazily so an older binary without ExpoWidgets does not crash at startup.
    const { default: NowPlayingWidget } = require('../../widgets/NowPlayingWidget') as {
      default: { updateSnapshot: (next: NowPlayingWidgetProps) => void };
    };
    NowPlayingWidget.updateSnapshot(props);
  } catch {
    // Native module + widget extension exist only after `npx expo run:ios`.
  }
}
