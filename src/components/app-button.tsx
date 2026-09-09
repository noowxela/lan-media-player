import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
};

export function AppButton({ label, variant = 'primary', disabled, ...props }: Props) {
  const theme = useTheme();
  const backgroundColor =
    variant === 'primary'
      ? '#3c87f7'
      : variant === 'danger'
        ? '#d14d4d'
        : theme.backgroundSelected;

  return (
    <Pressable
      {...props}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#ffffff',
  },
});
