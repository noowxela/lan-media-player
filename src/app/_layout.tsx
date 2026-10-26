import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { SharingBanner } from '@/components/sharing-banner';
import { WhatsNewSheet } from '@/components/whats-new-sheet';
import { MusicProvider } from '@/lib/player-context';
import { SharingProvider } from '@/lib/sharing-context';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <MusicProvider>
        <SharingProvider>
          <AnimatedSplashOverlay />
          <AppTabs />
          <SharingBanner />
          <WhatsNewSheet />
        </SharingProvider>
      </MusicProvider>
    </ThemeProvider>
  );
}
