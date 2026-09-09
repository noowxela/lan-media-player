import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { formatBytes } from '@/lib/format';
import {
  getLibraryFolderUri,
  listStoredMp3Files,
  subscribeLibrary,
} from '@/lib/library';

const FILES_APP_PATH =
  Platform.OS === 'ios'
    ? 'Files → Browse → On My iPhone → Music Player → music'
    : 'App private storage → files → music';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [folderUri, setFolderUri] = useState('');
  const [files, setFiles] = useState<{ filename: string; size: number }[]>([]);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(() => {
    setFolderUri(getLibraryFolderUri());
    setFiles(listStoredMp3Files());
  }, []);

  useEffect(() => {
    refresh();
    return subscribeLibrary(refresh);
  }, [refresh]);

  const copyPath = async () => {
    if (!folderUri) return;
    await Clipboard.setStringAsync(folderUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.three,
          paddingBottom: insets.bottom + BottomTabInset + Spacing.four,
          paddingHorizontal: Spacing.three,
          maxWidth: MaxContentWidth,
          width: '100%',
          alignSelf: 'center',
          gap: Spacing.three,
        }}>
        <ThemedText type="subtitle">Settings</ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Library folder</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Imported and transferred MP3s are saved on this phone in the app Documents folder, inside
            music.
          </ThemedText>
          <View style={styles.block}>
            <ThemedText type="small" themeColor="textSecondary">
              In the Files app
            </ThemedText>
            <ThemedText type="small">{FILES_APP_PATH}</ThemedText>
          </View>
          <View style={styles.block}>
            <ThemedText type="small" themeColor="textSecondary">
              On-device path
            </ThemedText>
            <ThemedText type="code" selectable>
              {folderUri || 'Loading…'}
            </ThemedText>
          </View>
          <AppButton
            label={copied ? 'Copied' : 'Copy path'}
            variant="secondary"
            onPress={() => void copyPath()}
          />
          {Platform.OS === 'ios' ? (
            <ThemedText type="small" themeColor="textSecondary">
              After a native rebuild, this folder also appears in the iOS Files app. You may need to
              open Files → Browse and look under On My iPhone.
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Android keeps this folder in the app’s private storage, so other file managers usually
              cannot open it.
            </ThemedText>
          )}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">MP3s in this folder</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {files.length === 1 ? '1 file' : `${files.length} files`}
          </ThemedText>
          {files.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No MP3 files stored yet.
            </ThemedText>
          ) : (
            files.map((file) => (
              <View key={file.filename} style={styles.fileRow}>
                <ThemedText type="small" style={styles.fileName}>
                  {file.filename}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatBytes(file.size)}
                </ThemedText>
              </View>
            ))
          )}
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  block: {
    gap: Spacing.half,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  fileName: {
    flex: 1,
  },
});
