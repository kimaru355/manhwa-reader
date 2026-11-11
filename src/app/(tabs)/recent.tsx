import { Ionicons } from '@expo/vector-icons';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Cover } from '../../components/Cover';
import { EmptyState } from '../../components/EmptyState';
import { useLibrary } from '../../lib/library';
import { openSeries } from '../../lib/series';
import { useTheme } from '../../lib/theme';

function ago(ts: number) {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export default function Recent() {
  const t = useTheme();
  const { ready, recents, removeRecent, clearRecents } = useLibrary();

  if (!ready) return null;
  if (recents.length === 0) {
    return <EmptyState icon="time-outline" title="Nothing read yet" message="Titles you open will appear here." />;
  }

  const confirmClear = () =>
    Alert.alert('Clear history?', 'This only removes the list, not your downloads or favorites.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearRecents },
    ]);

  return (
    <FlatList
      data={recents}
      keyExtractor={(r) => r.series.key}
      ListHeaderComponent={
        <Pressable onPress={confirmClear} style={styles.clear}>
          <Ionicons name="trash-outline" size={16} color={t.sub} />
          <Text style={{ color: t.sub, fontSize: 13 }}>Clear history</Text>
        </Pressable>
      }
      renderItem={({ item: r }) => (
        <Pressable
          style={[styles.row, { borderBottomColor: t.border }]}
          onPress={() => openSeries(r.series)}
          onLongPress={() =>
            Alert.alert(r.series.title, undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove from history', style: 'destructive', onPress: () => removeRecent(r.series.key) },
            ])
          }
        >
          <Cover series={r.series} style={styles.cover} />
          <View style={styles.info}>
            <Text style={[styles.when, { color: t.sub }]}>{ago(r.ts)}</Text>
            <Text numberOfLines={2} style={[styles.title, { color: t.text }]}>
              {r.series.title}
            </Text>
            <Text numberOfLines={1} style={[styles.sub, { color: t.sub }]}>
              Read to {r.chapterName}
              {r.total ? ` · p.${r.page}/${r.total}` : ''}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.sub} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  clear: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'flex-end', padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cover: { width: 72, height: 100 },
  info: { flex: 1, gap: 3 },
  when: { fontSize: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13 },
});
