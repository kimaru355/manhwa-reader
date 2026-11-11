import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Underlined tabs (top level) instead of a pill switcher. */
  variant?: 'tabs' | 'pill';
};

export function Segmented<T extends string>({ options, value, onChange, variant = 'pill' }: Props<T>) {
  const t = useTheme();
  if (variant === 'tabs') {
    return (
      <View style={[styles.tabs, { borderBottomColor: t.border }]}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} style={styles.tab} onPress={() => onChange(o.value)}>
              <Text style={[styles.tabText, { color: on ? t.accent : t.sub }]}>{o.label}</Text>
              <View style={[styles.underline, { backgroundColor: on ? t.accent : 'transparent' }]} />
            </Pressable>
          );
        })}
      </View>
    );
  }
  return (
    <View style={[styles.pill, { backgroundColor: t.card }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} style={[styles.seg, on && { backgroundColor: t.accent }]} onPress={() => onChange(o.value)}>
            <Text style={[styles.segText, { color: on ? '#fff' : t.sub }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingTop: 10 },
  tabText: { fontSize: 15, fontWeight: '700', paddingBottom: 8 },
  underline: { height: 2, alignSelf: 'stretch' },
  pill: { flexDirection: 'row', marginHorizontal: 12, marginTop: 10, padding: 3, borderRadius: 10 },
  seg: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  segText: { fontSize: 14, fontWeight: '600' },
});
