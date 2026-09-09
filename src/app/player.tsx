import Slider from '@react-native-community/slider';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime } from '@/lib/format';
import { useMusic } from '@/lib/player-context';

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    loop,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    setLoop,
  } = useMusic();

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.four,
            paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          },
        ]}>
        <ThemedView type="backgroundElement" style={styles.artwork}>
          <ThemedText type="title">♪</ThemedText>
        </ThemedView>

        <ThemedText type="subtitle" style={styles.title}>
          {currentTrack?.title ?? 'Nothing playing'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {currentTrack?.artist ?? (currentTrack ? 'Local MP3' : 'Pick a track in Library')}
        </ThemedText>

        <View style={styles.sliderBlock}>
          <Slider
            value={Math.min(currentTime, duration || currentTime)}
            minimumValue={0}
            maximumValue={Math.max(duration, 0.1)}
            minimumTrackTintColor="#3c87f7"
            maximumTrackTintColor={theme.backgroundSelected}
            thumbTintColor="#3c87f7"
            onSlidingComplete={(value) => {
              void seek(value);
            }}
          />
          <View style={styles.times}>
            <ThemedText type="small" themeColor="textSecondary">
              {formatTime(currentTime)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatTime(duration)}
            </ThemedText>
          </View>
        </View>

        <View style={styles.controls}>
          <AppButton label="Prev" variant="secondary" onPress={playPrevious} />
          <AppButton label={isPlaying ? 'Pause' : 'Play'} onPress={togglePlay} />
          <AppButton label="Next" variant="secondary" onPress={playNext} />
        </View>
        <AppButton
          label={loop ? 'Looping this track' : 'Loop off'}
          variant="secondary"
          onPress={() => setLoop(!loop)}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  artwork: {
    width: 220,
    height: 220,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  sliderBlock: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controls: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
});
