import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { formatTime } from '@/lib/format';
import { useMusic } from '@/lib/player-context';
import type { Track } from '@/lib/types';
import { useTheme } from '@/hooks/use-theme';

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { tracks, currentTrack, isPlaying, playTrack, importTracks, deleteTrack, deleteTracks } =
    useMusic();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectedCount = selected.size;
  const allSelected = tracks.length > 0 && selectedCount === tracks.length;

  const exitSelectMode = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(tracks.map((track) => track.id)));
  }, [tracks]);

  const onDeleteOne = (track: Track) => {
    Alert.alert('Remove track', `Delete ${track.title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void deleteTrack(track.id);
        },
      },
    ]);
  };

  const onDeleteSelected = () => {
    const count = selectedCount;
    if (count === 0) return;
    Alert.alert(
      'Delete tracks',
      `Delete ${count} ${count === 1 ? 'track' : 'tracks'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void deleteTracks([...selected]).then(exitSelectMode);
          },
        },
      ],
    );
  };

  const headerActions = useMemo(() => {
    if (selecting) {
      return (
        <View style={styles.actions}>
          <AppButton
            label={allSelected ? 'Clear all' : 'Select all'}
            variant="secondary"
            onPress={allSelected ? () => setSelected(new Set()) : selectAll}
          />
          <AppButton
            label={selectedCount ? `Delete ${selectedCount}` : 'Delete'}
            variant="danger"
            disabled={selectedCount === 0}
            onPress={onDeleteSelected}
          />
          <AppButton label="Cancel" variant="secondary" onPress={exitSelectMode} />
        </View>
      );
    }

    return (
      <View style={styles.actions}>
        <AppButton label="Import MP3s" onPress={() => void importTracks()} />
        {tracks.length > 0 ? (
          <AppButton label="Select" variant="secondary" onPress={() => setSelecting(true)} />
        ) : null}
      </View>
    );
  }, [
    allSelected,
    exitSelectMode,
    importTracks,
    onDeleteSelected,
    selectAll,
    selectedCount,
    selecting,
    tracks.length,
  ]);

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={tracks}
        keyExtractor={(item) => item.id}
        extraData={{ selecting, selectedCount, currentTrackId: currentTrack?.id, isPlaying }}
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          paddingHorizontal: Spacing.three,
          maxWidth: MaxContentWidth,
          width: '100%',
          alignSelf: 'center',
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="subtitle">Library</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {selecting
                ? `${selectedCount} selected`
                : `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}`}
            </ThemedText>
            {headerActions}
          </View>
        }
        ListEmptyComponent={
          <ThemedView type="backgroundElement" style={styles.empty}>
            <ThemedText type="small" themeColor="textSecondary">
              No songs yet. Import MP3s from Files, or receive them on the Transfer tab.
            </ThemedText>
          </ThemedView>
        }
        renderItem={({ item }) => {
          const active = item.id === currentTrack?.id;
          const isChecked = selected.has(item.id);
          return (
            <Pressable
              onPress={() => {
                if (selecting) {
                  toggleSelected(item.id);
                  return;
                }
                playTrack(item);
              }}
              onLongPress={() => {
                if (!selecting) {
                  setSelecting(true);
                  setSelected(new Set([item.id]));
                  return;
                }
                onDeleteOne(item);
              }}
              style={[
                styles.row,
                { backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement },
              ]}>
              {selecting ? (
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isChecked ? '#3c87f7' : theme.textSecondary,
                      backgroundColor: isChecked ? '#3c87f7' : 'transparent',
                    },
                  ]}>
                  {isChecked ? (
                    <ThemedText type="smallBold" style={styles.checkMark}>
                      ✓
                    </ThemedText>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.rowText}>
                <ThemedText type={active ? 'smallBold' : 'small'}>{item.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {active && isPlaying ? 'Playing · ' : ''}
                  {item.duration ? formatTime(item.duration) : item.filename}
                </ThemedText>
              </View>
              {selecting ? null : (
                <Pressable onPress={() => onDeleteOne(item)} hitSlop={8}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Delete
                  </ThemedText>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  empty: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    marginBottom: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: {
    color: '#ffffff',
    lineHeight: 16,
  },
});
