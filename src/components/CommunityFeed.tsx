import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAccount } from '../lib/account';
import {
  communityToSeries,
  fetchCommunity,
  unvote,
  vote,
  type CommunityRec,
  type Sort,
} from '../lib/community';
import { friendly, toastError } from '../lib/errors';
import { TIER_LABEL, TIER_ORDER } from '../lib/recs';
import { openSeries } from '../lib/series';
import { useTheme } from '../lib/theme';
import type { SeriesCategory, Tier } from '../lib/types';
import { Cover } from './Cover';
import { EmptyState } from './EmptyState';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'popular', label: 'Popular' },
  { value: 'week', label: 'This week' },
];

type CategoryFilter = 'all' | SeriesCategory;
const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'manga', label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
  { value: 'novel', label: 'Novels' },
];

export function CommunityFeed() {
  const t = useTheme();
  const { user } = useAccount();
  const [sort, setSort] = useState<Sort>('latest');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [tier, setTier] = useState<Tier | 'all'>('all');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CommunityRec[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useRef(0);
  const busy = useRef(false);

  const load = useCallback(
    async (reset: boolean, from: string | null) => {
      if (reset) {
        run.current++;
        busy.current = false;
      }
      if (busy.current) return;
      busy.current = true;
      const mine = run.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetchCommunity({
          sort,
          q: query,
          tier: tier === 'all' ? undefined : tier,
          category: category === 'all' ? undefined : category,
          cursor: reset ? null : from,
        });
        if (mine !== run.current) return;
        setItems((prev) => {
          const seen = new Set(reset ? [] : prev.map((r) => r.id));
          return [...(reset ? [] : prev), ...res.items.filter((r) => !seen.has(r.id))];
        });
        setCursor(res.nextCursor);
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
    [sort, query, tier, category],
  );

  // Any filter change starts over; typing waits a moment so each keystroke isn't a request.
  useEffect(() => {
    const timer = setTimeout(() => load(true, null), query ? 450 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const toggleVote = async (rec: CommunityRec) => {
    if (!user) {
      Alert.alert('Sign in to vote', 'An account is only needed to vote, not to read.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/account') },
      ]);
      return;
    }
    const apply = (r: CommunityRec, voted: boolean, votes: number) => (r.id === rec.id ? { ...r, voted, votes } : r);
    // Shown at once; put back if the server says no.
    setItems((prev) => prev.map((r) => apply(r, !rec.voted, Math.max(rec.votes + (rec.voted ? -1 : 1), 0))));
    try {
      const res = await (rec.voted ? unvote(rec.id) : vote(rec.id));
      setItems((prev) => prev.map((r) => apply(r, res.voted, res.votes)));
    } catch (e) {
      setItems((prev) => prev.map((r) => apply(r, rec.voted, rec.votes)));
      Alert.alert("Couldn't save your vote", friendly(e));
    }
  };

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} style={[styles.chip, { backgroundColor: on ? t.accent : t.card }]}>
      <Text style={{ color: on ? '#fff' : t.sub, fontSize: 13, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.flex}>
      <View style={styles.filters}>
        <View style={[styles.search, { backgroundColor: t.card }]}>
          <Ionicons name="search" size={18} color={t.sub} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search community picks"
            placeholderTextColor={t.sub}
            style={[styles.input, { color: t.text }]}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? <Ionicons name="close-circle" size={18} color={t.sub} onPress={() => setQuery('')} /> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SORTS.map((s) => chip(s.label, sort === s.value, () => setSort(s.value)))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {CATEGORIES.map((c) => chip(c.label, category === c.value, () => setCategory(c.value)))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chip('Any tier', tier === 'all', () => setTier('all'))}
          {TIER_ORDER.map((x) => chip(TIER_LABEL[x], tier === x, () => setTier(x)))}
        </ScrollView>
      </View>

      {error && items.length === 0 ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load the community" message={error} action="Try again" onAction={() => load(true, null)} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => cursor && load(false, cursor)}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => load(true, null)} tintColor={t.accent} />}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={t.accent} size="large" style={{ marginTop: 60 }} />
            ) : (
              <EmptyState
                icon="people-outline"
                title="Nothing here yet"
                message="No one has shared a recommendation that matches. Open a title and tap Recommend to be the first."
              />
            )
          }
          ListFooterComponent={loading && items.length > 0 ? <ActivityIndicator color={t.accent} style={{ margin: 20 }} /> : <View style={{ height: 24 }} />}
          renderItem={({ item }) => (
            <Pressable style={[styles.row, { borderBottomColor: t.border }]} onPress={() => openSeries(communityToSeries(item))}>
              <Cover series={communityToSeries(item)} style={styles.cover} />
              <View style={styles.info}>
                <Text numberOfLines={2} style={[styles.title, { color: t.text }]}>
                  {item.title}
                </Text>
                <Text style={{ color: t.accent, fontSize: 12, fontWeight: '600' }}>
                  {TIER_LABEL[item.tier]} · {item.category}
                </Text>
                {item.note ? (
                  <Text numberOfLines={3} style={{ color: t.sub, fontSize: 13 }}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
              <Pressable hitSlop={8} onPress={() => toggleVote(item)} style={[styles.vote, item.voted && { backgroundColor: t.accent }]}>
                <Ionicons name={item.voted ? 'arrow-up-circle' : 'arrow-up-circle-outline'} size={22} color={item.voted ? '#fff' : t.sub} />
                <Text style={{ color: item.voted ? '#fff' : t.text, fontWeight: '700', fontSize: 13 }}>{item.votes}</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filters: { gap: 8, paddingTop: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, paddingHorizontal: 12, borderRadius: 10 },
  input: { flex: 1, height: 42, fontSize: 15 },
  chips: { gap: 8, paddingHorizontal: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  list: { paddingTop: 6, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  cover: { width: 60, height: 84 },
  info: { flex: 1, gap: 3 },
  title: { fontSize: 15, fontWeight: '600' },
  vote: { alignItems: 'center', gap: 2, minWidth: 48, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 12 },
});
