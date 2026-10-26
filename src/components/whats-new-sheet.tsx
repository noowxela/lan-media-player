import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ChangelogEntryView } from '@/components/changelog-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { ChangelogEntry } from '@/lib/changelog';
import { markWhatsNewSeen, pendingWhatsNew } from '@/lib/whats-new';

/** One-time "本次更新 · What's new" sheet on the first launch after the app version changes. */
export function WhatsNewSheet() {
  const [entry, setEntry] = useState<ChangelogEntry | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void pendingWhatsNew().then((e) => {
        if (alive) setEntry(e);
      });
    }, 1500); // after the splash animation
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);
  if (!entry) return null;
  const close = () => {
    markWhatsNewSeen();
    setEntry(null);
  };
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <ThemedView style={styles.sheet}>
        <ThemedText type="subtitle">本次更新 · What&apos;s new</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          v{entry.version} ({entry.build}) · {entry.date}
        </ThemedText>
        <ScrollView contentContainerStyle={styles.body}>
          <ChangelogEntryView entry={entry} showHeader={false} />
        </ScrollView>
        <View style={styles.footer}>
          <ThemedText type="small" themeColor="textSecondary">
            以后可以在 设置 → 关于 · 版本 → 更新说明 再看 · See Settings → About for all versions
          </ThemedText>
          <AppButton label="知道了 · Got it" onPress={close} />
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, padding: Spacing.four, gap: Spacing.two },
  body: { paddingVertical: Spacing.two },
  footer: { gap: Spacing.two, paddingBottom: Spacing.four },
});
