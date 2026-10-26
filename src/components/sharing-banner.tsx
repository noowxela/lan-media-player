import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useSharing, type SharePhase } from '@/lib/sharing-context';

const LABELS: Record<Exclude<SharePhase, 'off'>, string> = {
  starting: '分享中… Starting',
  on: '分享中 Sharing',
  sleeping: '分享休眠中 Finishing transfers',
  paused: '分享已暂停 Resumes when app opens',
};

/** Persistent "分享中" pill on every tab while the LAN share is on (tap → Transfer, Stop → stop sharing). */
export function SharingBanner() {
  const { phase, connected, stop, deleteGrants, revokeDeleteGrants } = useSharing();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  if (phase === 'off') return null;
  const count = phase === 'on' && connected.length ? ` · ${connected.length}` : '';
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Spacing.one }]}>
      <View style={[styles.pill, phase === 'on' ? styles.on : styles.idle]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Transfer"
          onPress={() => router.navigate('/transfer')}
          style={styles.main}>
          <View style={[styles.dot, phase === 'on' ? styles.dotOn : styles.dotIdle]} />
          <ThemedText type="small" style={styles.text}>
            {LABELS[phase]}
            {count}
          </ThemedText>
        </Pressable>
        {deleteGrants.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Revoke delete permission"
            hitSlop={8}
            onPress={revokeDeleteGrants}
            style={styles.grant}>
            <ThemedText type="small" style={styles.text}>
              🗑 删除已授权 ✕
            </ThemedText>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Stop sharing" hitSlop={8} onPress={() => void stop()}>
          <ThemedText type="smallBold" style={styles.text}>
            Stop
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: Spacing.two,
    left: Spacing.two,
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: 999,
  },
  on: { backgroundColor: 'rgba(36, 138, 61, 0.92)' },
  idle: { backgroundColor: 'rgba(120, 120, 128, 0.92)' },
  main: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: '#b8f5c4' },
  dotIdle: { backgroundColor: '#e5e5ea' },
  text: { color: '#ffffff' },
  grant: { paddingHorizontal: Spacing.one, borderRadius: 999, backgroundColor: 'rgba(255, 149, 0, 0.9)' },
});
