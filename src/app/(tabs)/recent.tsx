import { Ionicons } from '@expo/vector-icons';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Cover } from '../../components/Cover';
import { EmptyState } from '../../components/EmptyState';
import { openManhwa } from '../../components/ManhwaGrid';
import { useLibrary } from '../../lib/library';
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

  const confirmClear = () =>
    Alert.alert('Clear history?', 'This only removes the list, not your files or favorites.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearRecents },
    ]);

  return (
    <>
      {recents.length === 0 ? (
        <EmptyState icon="time-outline" title="Nothing read yet" message="Manhwa you open will appear here." />
      ) : (
        <FlatList
          data={recents}
          keyExtractor={(r) => r.manhwa.id}
          ListHeaderComponent={
            <Pressable onPress={confirmClear} style={styles.clear}>
              <Ionicons name="trash-outline" size={16} color={t.sub} />
              <Text style={{ color: t.sub, fontSize: 13 }}>Clear history</Text>
            </Pressable>
          }
          renderItem={({ item: { recent, manhwa } }) => {
            const chapter = manhwa.chapters[recent.chapterIndex];
            return (
              <Pressable
                style={[styles.row, { borderBottomColor: t.border }]}
                onPress={() => openManhwa(manhwa.id)}
                onLongPress={() =>
                  Alert.alert(manhwa.title, undefined, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove from history', style: 'destructive', onPress: () => removeRecent(manhwa.id) },
                  ])
                }
              >
                <Cover manhwa={manhwa} style={styles.cover} />
                <View style={styles.info}>
                  <Text style={[styles.when, { color: t.sub }]}>{ago(recent.ts)}</Text>
                  <Text numberOfLines={2} style={[styles.title, { color: t.text }]}>
                    {manhwa.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.sub, { color: t.sub }]}>
                    Read to {chapter?.name ?? '—'}
                    {recent.total ? ` · p.${recent.page}/${recent.total}` : ''}
                  </Text>
                  <Text numberOfLines={1} style={[styles.sub, { color: t.sub }]}>
                    {manhwa.chapters.length} chapters
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.sub} />
              </Pressable>
            );
          }}
        />
      )}
    </>
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
