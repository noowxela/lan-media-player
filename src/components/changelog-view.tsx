import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { CHANGELOG_SECTIONS, type ChangelogEntry } from '@/lib/changelog';

/** One version's release notes: 新功能 / 修复 / 改进. */
export function ChangelogEntryView({ entry, showHeader = true }: { entry: ChangelogEntry; showHeader?: boolean }) {
  return (
    <View style={styles.entry}>
      {showHeader ? (
        <ThemedText type="smallBold">
          v{entry.version} ({entry.build}) · {entry.date}
        </ThemedText>
      ) : null}
      {CHANGELOG_SECTIONS.filter((s) => entry[s.key].length).map((s) => (
        <View key={s.key} style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            {s.label}
          </ThemedText>
          {entry[s.key].map((line) => (
            <ThemedText key={line} type="small">
              • {line}
            </ThemedText>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { gap: Spacing.one },
  section: { gap: Spacing.half },
});
