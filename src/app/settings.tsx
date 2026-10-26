import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton } from '@/components/app-button';
import { ChangelogEntryView } from '@/components/changelog-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { appInfoLine, formatBuildTime, getAppInfo } from '@/lib/app-info';
import { CHANGELOG } from '@/lib/changelog';
import { formatBytes } from '@/lib/format';
import { LAN_API_VERSION } from '@/lib/lan-server';
import {
  getLibraryFolderUri,
  listStoredMp3Files,
  subscribeLibrary,
} from '@/lib/library';
import { useSharing } from '@/lib/sharing-context';

const FILES_APP_PATH =
  Platform.OS === 'ios'
    ? 'Files → Browse → On My iPhone → Music Player → music'
    : 'App private storage → files → music';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [folderUri, setFolderUri] = useState('');
  const [files, setFiles] = useState<{ filename: string; size: number }[]>([]);
  const [copied, setCopied] = useState(false);
  const [versionCopied, setVersionCopied] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const appInfo = getAppInfo();
  const sharing = useSharing();

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

  const copyVersion = async () => {
    await Clipboard.setStringAsync(
      `Music Player ${appInfoLine(appInfo)} · LAN API v${LAN_API_VERSION} · ${appInfo.features.join(', ')}`,
    );
    setVersionCopied(true);
    setTimeout(() => setVersionCopied(false), 2000);
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
          <ThemedText type="smallBold">LAN sharing</ThemedText>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <ThemedText type="small">锁屏保持连接 (静音保活) · Keep connected when locked</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Plays a silent loop while sharing so iOS keeps the app running with the screen locked,
                even when no music plays. Uses more battery, pauses other apps’ audio, and is not App
                Store-safe (Apple rejects silent-audio keep-alive) — fine for this personal build.
              </ThemedText>
            </View>
            <Switch
              value={sharing.settings.keepAliveSilent}
              onValueChange={(v: boolean) => sharing.setSetting('keepAliveSilent', v)}
            />
          </View>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <ThemedText type="small">Fixed PIN</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Keep the same PIN every time you start sharing. Paired computers never need the PIN.
              </ThemedText>
            </View>
            <Switch value={sharing.settings.stablePin} onValueChange={(v: boolean) => sharing.setSetting('stablePin', v)} />
          </View>
          <AppButton label="New PIN" variant="secondary" onPress={() => void sharing.rotatePin()} />
          {!sharing.hasGraceTime ? (
            <ThemedText type="small" themeColor="textSecondary">
              This build has no background grace module yet: when locked without music, iOS pauses
              sharing after ~5 s instead of finishing transfers first. Rebuild the app to add it.
            </ThemedText>
          ) : null}
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Paired computers</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Accepted with “remember” (e.g. Knowledge Dashboard). They reconnect without PIN or Accept.
            Forget one to require Accept again. Disconnect on the Transfer tab also forgets it.
          </ThemedText>
          {sharing.paired.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              None yet.
            </ThemedText>
          ) : (
            sharing.paired.map((device) => (
              <View key={device.token} style={styles.fileRow}>
                <View style={styles.flex}>
                  <ThemedText type="small">{device.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {device.ip} · last seen {new Date(device.lastSeen).toLocaleString()}
                  </ThemedText>
                </View>
                <AppButton label="Forget" variant="danger" onPress={() => sharing.revoke(device.token)} />
              </View>
            ))
          )}
          {sharing.paired.length > 1 ? (
            <AppButton
              label="Forget all"
              variant="danger"
              onPress={() =>
                Alert.alert('Forget all paired computers?', 'They will need Accept again.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Forget all', style: 'destructive', onPress: () => sharing.revokeAll() },
                ])
              }
            />
          ) : null}
        </ThemedView>

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

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">关于 · 版本 About</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy version info"
            onPress={() => void copyVersion()}
            onLongPress={() => void copyVersion()}
            style={styles.block}>
            <ThemedText type="small">
              Music Player v{appInfo.version}
              {appInfo.build ? ` (build ${appInfo.build})` : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {appInfo.commit ? `提交 commit ${appInfo.commit}${appInfo.dirty ? '-dirty' : ''}` : '提交 commit —'}
              {appInfo.builtAt ? ` · 构建 built ${formatBuildTime(appInfo.builtAt)}` : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              LAN API v{LAN_API_VERSION} · {appInfo.features.join(' · ')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {versionCopied ? '已复制 ✓ Copied' : '点一下复制 · Tap to copy'}
            </ThemedText>
          </Pressable>
          <AppButton
            label={showNotes ? '收起更新说明 · Hide release notes' : `更新说明 · Release notes (${CHANGELOG.length})`}
            variant="secondary"
            onPress={() => setShowNotes((v) => !v)}
          />
          {showNotes ? CHANGELOG.map((entry) => <ChangelogEntryView key={entry.version} entry={entry} />) : null}
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
  flex: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
