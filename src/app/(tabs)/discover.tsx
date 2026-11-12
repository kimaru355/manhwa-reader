import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '../../components/EmptyState';
import { Segmented } from '../../components/Segmented';
import { SeriesGrid } from '../../components/SeriesGrid';
import { friendly, toastError } from '../../lib/errors';
import { useRecs } from '../../lib/recs';
import { DEFAULT_SOURCES, getSource } from '../../lib/sources';
import { useTheme } from '../../lib/theme';
import type { Category, Series, SourceId } from '../../lib/types';

type Top = 'default' | 'interesting';

/** Loads a source page by page; restarts when the source or search changes. */
function useBrowse(source: SourceId | undefined, query: string) {
  const [items, setItems] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = useRef(0);
  const run = useRef(0);
  const busy = useRef(false);

  const load = useCallback(
    async (reset: boolean) => {
      const src = source ? getSource(source) : undefined;
      if (!src) return;
      if (reset) {
        run.current++;
        page.current = 0;
        busy.current = false;
      }
      if (busy.current) return;
      busy.current = true;
      const mine = run.current;
      setLoading(true);
      setError(null);
      if (reset) setItems([]);
      try {
        const res = await src.browse({ page: page.current, query });
        if (mine !== run.current) return;
        page.current++;
        setItems((prev) => {
          const seen = new Set(prev.map((s) => s.key));
          return [...(reset ? [] : prev), ...res.items.filter((s) => !seen.has(s.key))];
        });
        setHasMore(res.hasMore);
      } catch (e) {
        if (mine === run.current) {
          setError(friendly(e));
          toastError(e);
        }
      } finally {
        if (mine === run.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [source, query],
  );

  useEffect(() => {
    // Typing restarts the search shortly after the last keystroke.
    const t = setTimeout(() => load(true), query ? 450 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  return { items, loading, hasMore, error, more: () => hasMore && load(false), reload: () => load(true) };
}

export default function Discover() {
  const t = useTheme();
  const { recs } = useRecs();
  const [top, setTop] = useState<Top>('default');
  const [category, setCategory] = useState<Category>('manga');
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState<Partial<Record<Category, number>>>({});

  const shown: Category = top === 'interesting' ? 'interesting' : category;
  const choices: { source: SourceId; name?: string }[] = recs.sources?.[shown]?.length
    ? recs.sources[shown]!
    : DEFAULT_SOURCES[shown].map((source) => ({ source }));
  const chosen = choices[Math.min(pick[shown] ?? 0, Math.max(choices.length - 1, 0))];
  const source = chosen?.source;

  const { items, loading, hasMore, error, more, reload } = useBrowse(source, query);

  const changeTop = (v: Top) => {
    setTop(v);
    setQuery('');
  };

  return (
    <View style={styles.flex}>
      <Segmented
        variant="tabs"
        value={top}
        onChange={changeTop}
        options={[
          { value: 'default', label: 'Default' },
          { value: 'interesting', label: 'Interesting' },
        ]}
      />
      {top === 'default' ? (
        <Segmented
          value={category}
          onChange={(c) => {
            setCategory(c);
            setQuery('');
          }}
          options={[
            { value: 'manga', label: 'Manga' },
            { value: 'manhwa', label: 'Manhwa' },
            { value: 'novel', label: 'Novels' },
          ]}
        />
      ) : null}

      {choices.length > 1 ? (
        <View style={styles.chips}>
          {choices.map((c, i) => {
            const on = c === chosen;
            return (
              <Pressable
                key={c.source}
                onPress={() => setPick((p) => ({ ...p, [shown]: i }))}
                style={[styles.chip, { backgroundColor: on ? t.accent : t.card }]}
              >
                <Text style={{ color: on ? '#fff' : t.sub, fontSize: 13 }}>{c.name ?? getSource(c.source)?.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.search, { backgroundColor: t.card }]}>
        <Ionicons name="search" size={18} color={t.sub} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${chosen?.name ?? (source ? getSource(source)?.name : '')}`}
          placeholderTextColor={t.sub}
          style={[styles.input, { color: t.text }]}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? <Ionicons name="close-circle" size={18} color={t.sub} onPress={() => setQuery('')} /> : null}
      </View>

      {error && items.length === 0 ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load titles"
          message={error}
          action="Try again"
          onAction={reload}
        />
      ) : !source ? (
        <EmptyState icon="library-outline" title="No source for this section" />
      ) : (
        <SeriesGrid
          data={items}
          onEnd={more}
          loadingMore={loading && items.length > 0}
          onRefresh={reload}
          refreshing={false}
          empty={
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={t.accent} size="large" />
              </View>
            ) : (
              <EmptyState icon="search" title="No matches" />
            )
          }
        />
      )}
      {error && items.length > 0 && hasMore ? (
        <Text style={[styles.more, { color: t.danger }]} onPress={more}>
          {"Couldn't load more — tap to retry"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { paddingTop: 60, alignItems: 'center' },
  chips: { flexDirection: 'row', gap: 8, marginHorizontal: 12, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  input: { flex: 1, height: 42, fontSize: 15 },
  more: { textAlign: 'center', padding: 10, fontSize: 13 },
});
