import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { CommunityFeed } from '../../components/CommunityFeed';
import { Cover } from '../../components/Cover';
import { EmptyState } from '../../components/EmptyState';
import { Segmented } from '../../components/Segmented';
import { TIER_LABEL, TIER_ORDER, toSeries, useRecs } from '../../lib/recs';
import { openSeries } from '../../lib/series';
import { useTheme } from '../../lib/theme';
import type { Category, Series, Tier } from '../../lib/types';

type Top = 'home' | 'community';

const COLUMNS = 3;
const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'manga', label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
  { value: 'isekai', label: 'Isekai' },
  { value: 'novel', label: 'Novels' },
];

type Row = { type: 'header'; tier: Tier; count: number } | { type: 'cards'; items: Series[]; id: string };

export default function Home() {
  const t = useTheme();
  const { recs, loading, error, refresh } = useRecs();
  const [top, setTop] = useState<Top>('home');
  const [category, setCategory] = useState<Category>('manga');
  const shown = category;

  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const tier of TIER_ORDER) {
      const list = recs.recommendations.filter((r) => r.category === shown && r.tier === tier).map(toSeries);
      if (!list.length) continue;
      out.push({ type: 'header', tier, count: list.length });
      for (let i = 0; i < list.length; i += COLUMNS) {
        out.push({ type: 'cards', items: list.slice(i, i + COLUMNS), id: `${tier}-${i}` });
      }
    }
    return out;
  }, [recs, shown]);

  const noteFor = (key: string) => recs.recommendations.find((r) => `${r.source}:${r.id}` === key)?.note;

  return (
    <View style={styles.flex}>
      <Segmented
        variant="tabs"
        value={top}
        onChange={setTop}
        options={[
          { value: 'home', label: 'Home' },
          { value: 'community', label: 'Community' },
        ]}
      />
      {top === 'home' ? <Segmented value={category} onChange={setCategory} options={CATEGORIES} /> : null}

      {top === 'community' ? (
        <CommunityFeed />
      ) : (
        <>
      {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(r) => (r.type === 'header' ? `h-${r.tier}` : r.id)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refresh()} tintColor={t.accent} />}
        ListEmptyComponent={
          <EmptyState
            icon="sparkles-outline"
            title="No recommendations here yet"
            message="The author hasn't recommended anything in this section. Pull down to refresh, or browse Discover."
          />
        }
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <View style={styles.header}>
              <Text style={[styles.headerText, { color: t.text }]}>{TIER_LABEL[item.tier]}</Text>
              <Text style={{ color: t.sub }}>{item.count}</Text>
            </View>
          ) : (
            <View style={styles.row}>
              {item.items.map((s) => (
                <Pressable key={s.key} style={styles.cell} onPress={() => openSeries(s)}>
                  <Cover series={s} style={styles.cover} />
                  <Text numberOfLines={2} style={[styles.title, { color: t.text }]}>
                    {s.title}
                  </Text>
                  {noteFor(s.key) ? (
                    <View style={styles.noteRow}>
                      <Ionicons name="sparkles" size={11} color={t.accent} />
                      <Text numberOfLines={1} style={[styles.note, { color: t.sub }]}>
                        {noteFor(s.key)}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
              {/* Pads a short last row so cards keep their width. */}
              {Array.from({ length: COLUMNS - item.items.length }, (_, i) => (
                <View key={`pad-${i}`} style={styles.cell} />
              ))}
            </View>
          )
        }
      />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  error: { fontSize: 12, paddingHorizontal: 14, paddingTop: 8 },
  list: { paddingHorizontal: 12, paddingBottom: 24, flexGrow: 1 },
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 18, paddingBottom: 8 },
  headerText: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  cell: { flex: 1 },
  cover: { width: '100%', aspectRatio: 0.72 },
  title: { marginTop: 6, fontSize: 14, fontWeight: '500', lineHeight: 18 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  note: { flex: 1, fontSize: 11 },
});
