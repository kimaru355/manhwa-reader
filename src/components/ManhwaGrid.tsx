import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useLibrary } from '../lib/library';
import { useTheme } from '../lib/theme';
import type { Manhwa } from '../lib/types';
import { Cover } from './Cover';

const COLUMNS = 3;

export const openManhwa = (id: string) => router.push({ pathname: '/manhwa', params: { id } });

export function ManhwaGrid({
  data,
  onRefresh,
  refreshing,
  header,
}: {
  data: Manhwa[];
  onRefresh?: () => void;
  refreshing?: boolean;
  header?: React.ReactElement;
}) {
  const t = useTheme();
  const { getProgress } = useLibrary();

  return (
    <FlatList
      data={data}
      keyExtractor={(m) => m.id}
      numColumns={COLUMNS}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.accent} /> : undefined
      }
      renderItem={({ item }) => {
        const progress = getProgress(item.id);
        const sub = progress
          ? `${item.chapters[progress.chapterIndex]?.name ?? '—'}`
          : `${item.chapters.length} chapter${item.chapters.length === 1 ? '' : 's'}`;
        return (
          <Pressable style={styles.cell} onPress={() => openManhwa(item.id)}>
            <Cover manhwa={item} style={styles.cover} />
            <Text numberOfLines={2} style={[styles.title, { color: t.text }]}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={[styles.sub, { color: t.sub }]}>
              {sub}
            </Text>
          </Pressable>
        );
      }}
      // Keeps a last row with fewer than COLUMNS items from stretching.
      ListFooterComponent={<View style={{ height: 24 }} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingTop: 8 },
  row: { gap: 10, marginBottom: 14 },
  cell: { flex: 1 / COLUMNS, maxWidth: `${100 / COLUMNS}%` },
  cover: { width: '100%', aspectRatio: 0.72 },
  title: { marginTop: 6, fontSize: 14, fontWeight: '500', lineHeight: 18 },
  sub: { marginTop: 2, fontSize: 12 },
});
