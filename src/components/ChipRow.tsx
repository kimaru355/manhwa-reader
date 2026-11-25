import { Pressable, ScrollView, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../lib/theme';

/**
 * A single line of chips that scrolls sideways. A horizontal ScrollView inside a column layout can be squeezed
 * to less than its content's height, which clips the labels, so the row never shrinks (flexShrink 0) and every
 * chip has a minimum height with its text centred.
 */
export function ChipRow({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.row}
      contentContainerStyle={[styles.content, contentStyle]}
    >
      {children}
    </ScrollView>
  );
}

/** A filled chip: accent when on, card colour when off. */
export function Chip({
  label,
  on,
  onPress,
  onLongPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[styles.chip, { backgroundColor: on ? t.accent : t.card }]}>
      <Text style={{ color: on ? '#fff' : t.sub, fontSize: 13, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

/** Style for chips that are not made with `Chip` (outlined or with an icon): the same minimum height and centring. */
export const chipBox = { minHeight: 36, justifyContent: 'center', alignItems: 'center' } as const;

const styles = StyleSheet.create({
  row: { flexGrow: 0, flexShrink: 0 },
  content: { gap: 8, paddingHorizontal: 12, alignItems: 'center' },
  chip: { ...chipBox, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 18 },
});
