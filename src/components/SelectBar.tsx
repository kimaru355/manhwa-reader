import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Selection } from '../lib/useSelection';
import { useTheme } from '../lib/theme';

/**
 * The bar shown while picking several titles: how many are picked, Select all / Unselect all, and Delete.
 * `keys` are the titles currently on screen; only those count, so a filter change can't delete unseen titles.
 */
export function SelectBar({
  sel,
  keys,
  noun,
  detail,
  onDelete,
}: {
  sel: Selection;
  keys: string[];
  /** What the titles are called in the confirmation, e.g. "downloads". */
  noun: string;
  detail: string;
  onDelete: (keys: string[]) => void;
}) {
  const t = useTheme();
  const chosen = keys.filter((k) => sel.picked.has(k));
  const all = keys.length > 0 && chosen.length === keys.length;

  const confirm = () => {
    if (!chosen.length) return;
    const n = chosen.length;
    Alert.alert(`Delete ${n} ${n === 1 ? 'title' : 'titles'} from ${noun}?`, detail, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDelete(chosen);
          sel.exit();
        },
      },
    ]);
  };

  return (
    <View style={[styles.bar, { backgroundColor: t.card }]}>
      <Pressable hitSlop={8} onPress={sel.exit} accessibilityLabel="Cancel selection">
        <Ionicons name="close" size={24} color={t.text} />
      </Pressable>
      <Text style={[styles.count, { color: t.text }]}>{chosen.length} selected</Text>
      <Pressable hitSlop={8} onPress={() => (all ? sel.clear() : sel.selectAll(keys))}>
        <Text style={{ color: t.accent, fontWeight: '600', fontSize: 14 }}>{all ? 'Unselect all' : 'Select all'}</Text>
      </Pressable>
      <Pressable
        hitSlop={8}
        disabled={!chosen.length}
        onPress={confirm}
        style={[styles.del, { backgroundColor: t.danger, opacity: chosen.length ? 1 : 0.4 }]}
        accessibilityLabel="Delete selected"
      >
        <Ionicons name="trash-outline" size={16} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Delete</Text>
      </Pressable>
    </View>
  );
}

/** The small "Select" button that enters selection mode. */
export function SelectButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable hitSlop={8} onPress={onPress} style={styles.pick} accessibilityLabel="Select titles">
      <Ionicons name="checkbox-outline" size={16} color={t.accent} />
      <Text style={{ color: t.accent, fontWeight: '600', fontSize: 13 }}>Select</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10 },
  count: { flex: 1, fontSize: 15, fontWeight: '600' },
  del: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
