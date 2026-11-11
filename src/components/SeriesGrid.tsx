import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useDownloads } from '../lib/downloads';
import { openSeries } from '../lib/series';
import { useTheme } from '../lib/theme';
import type { Series } from '../lib/types';
import { Cover } from './Cover';

const COLUMNS = 3;

type Props = {
  data: Series[];
  onRefresh?: () => void;
  refreshing?: boolean;
  onEnd?: () => void;
  loadingMore?: boolean;
  header?: React.ReactElement;
  empty?: React.ReactElement;
  sub?: (s: Series) => string | undefined;
  onLongPress?: (key: string) => void;
};

/** Cover grid for any list of titles. Titles with saved chapters get a badge. */
export function SeriesGrid({ data, onRefresh, refreshing, onEnd, loadingMore, header, empty, sub, onLongPress }: Props) {
  const t = useTheme();
  const { getDownloaded } = useDownloads();

  return (
    <FlatList
      data={data}
      keyExtractor={(s) => s.key}
      numColumns={COLUMNS}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={styles.list}
      columnWrapperStyle={styles.row}
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.accent} /> : undefined
      }
      renderItem={({ item }) => {
        const saved = getDownloaded(item.key)?.chapters.length ?? 0;
        const line = sub?.(item);
        return (
          <Pressable style={styles.cell} onPress={() => openSeries(item)} onLongPress={onLongPress ? () => onLongPress(item.key) : undefined}>
            <View>
              <Cover series={item} style={styles.cover} />
              {saved ? (
                <View style={[styles.badge, { backgroundColor: t.accent }]}>
                  <Ionicons name="download" size={11} color="#fff" />
                  <Text style={styles.badgeText}>{saved}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={2} style={[styles.title, { color: t.text }]}>
              {item.title}
            </Text>
            {line ? (
              <Text numberOfLines={1} style={[styles.sub, { color: t.sub }]}>
                {line}
              </Text>
            ) : null}
          </Pressable>
        );
      }}
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={t.accent} style={{ margin: 20 }} /> : <View style={{ height: 24 }} />
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingTop: 8 },
  row: { gap: 10, marginBottom: 14 },
  // Keeps a last row with fewer than COLUMNS items from stretching.
  cell: { flex: 1 / COLUMNS, maxWidth: `${100 / COLUMNS}%` },
  cover: { width: '100%', aspectRatio: 0.72 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  title: { marginTop: 6, fontSize: 14, fontWeight: '500', lineHeight: 18 },
  sub: { marginTop: 2, fontSize: 12 },
});
