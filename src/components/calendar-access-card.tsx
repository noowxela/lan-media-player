import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { calendarPermissions, requestCalendarAccess, type CalPermissions } from '@/lib/phone-calendar';

const LABEL: Record<string, string> = {
  granted: '✅ 已允许 Allowed',
  denied: '⛔ 已拒绝 Denied',
  undetermined: '❔ 未设置 Not asked yet',
};

/** Settings card: lets the paired computer read / edit iPhone Calendar + Reminders (dashboard 📅 日历). */
export function CalendarAccessCard() {
  const [perm, setPerm] = useState<CalPermissions | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    calendarPermissions()
      .then((p) => {
        setPerm(p);
        setError('');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh(); // back from iOS Settings
    });
    return () => sub.remove();
  }, [refresh]);

  const ask = async () => {
    try {
      setPerm(await requestCalendarAccess());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const allGranted = perm?.calendar === 'granted' && perm?.reminders === 'granted';
  const anyDenied = perm?.calendar === 'denied' || perm?.reminders === 'denied';

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">日历与提醒事项 Calendar & Reminders</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        允许后, 已连接的电脑 (知识中心 📅 日历) 可以查看、新建、修改日历活动和提醒事项; 删除仍需要 "允许删除"。
      </ThemedText>
      <View style={styles.row}>
        <ThemedText type="small">日历 Calendar</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{perm ? LABEL[perm.calendar] ?? perm.calendar : '…'}</ThemedText>
      </View>
      <View style={styles.row}>
        <ThemedText type="small">提醒事项 Reminders</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{perm ? LABEL[perm.reminders] ?? perm.reminders : '…'}</ThemedText>
      </View>
      {!!error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      {!allGranted && !anyDenied && <AppButton label="允许访问 Allow access" onPress={() => void ask()} />}
      {anyDenied && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            iOS 只会询问一次。请到 设置 → Music Player 打开 "日历" 和 "提醒事项" (完全访问)。
          </ThemedText>
          <AppButton label="打开 iPhone 设置 Open Settings" variant="secondary" onPress={() => void Linking.openSettings()} />
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, padding: Spacing.three, borderRadius: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
});
