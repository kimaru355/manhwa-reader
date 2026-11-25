import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '../components/Cover';
import { Segmented } from '../components/Segmented';
import { useAccount } from '../lib/account';
import { fetchCommunityBookmarks, mySuggestions, submitBookmark } from '../lib/community';
import { useDownloads } from '../lib/downloads';
import { friendly } from '../lib/errors';
import { useLibrary } from '../lib/library';
import { TIER_LABEL, TIER_ORDER, useRecs } from '../lib/recs';
import { useTheme } from '../lib/theme';
import type { Bookmark, Series, Tier } from '../lib/types';
import { mapLimit } from '../lib/util';

type Tab = 'titles' | 'bookmarks';

/** A spot in a title; two bookmarks on the same page are the same bookmark here. */
const spot = (seriesKey: string, chapterId: string, page: number) => `${seriesKey}|${chapterId}|${page}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The reader's titles (favorites, wishlist and titles they bookmarked) and their chapter bookmarks, marked with
 * whether they are already recommended, so the rest can be recommended in one go.
 */
export default function Recommend() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const [tab, setTab] = useState<Tab>('titles');

  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </Pressable>
        <Text style={[styles.barTitle, { color: t.text }]}>Recommend</Text>
        <View style={{ width: 26 }} />
      </View>
      {!account.user ? (
        <View style={styles.center}>
          <Text style={{ color: t.sub, textAlign: 'center' }}>Sign in to recommend titles and bookmarks to other readers.</Text>
          <Pressable onPress={() => router.push('/account')} style={[styles.send, { backgroundColor: t.accent }]}>
            <Text style={styles.sendText}>Sign in</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={{ paddingHorizontal: 16 }}>
            <Segmented
              variant="tabs"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'titles', label: 'Titles' },
                { value: 'bookmarks', label: 'Chapter bookmarks' },
              ]}
            />
          </View>
          {tab === 'titles' ? <TitlesTab /> : <BookmarksTab />}
        </>
      )}
    </View>
  );
}

/** Every title the reader keeps (favorites, wishlist, and titles with bookmarks), except ones that can't be shared. */
function useMyTitles() {
  const { favorites, wishlist, recents, bookmarks } = useLibrary();
  const { items: downloaded } = useDownloads();
  return useMemo(() => {
    // Bookmarks only name their title, so its details come from wherever else the title is kept.
    const known = new Map<string, Series>();
    for (const s of [...downloaded.map((d) => d.series), ...recents.map((r) => r.series), ...wishlist, ...favorites]) known.set(s.key, s);
    const out = new Map<string, Series>();
    for (const s of [...favorites, ...wishlist]) out.set(s.key, s);
    for (const b of bookmarks) {
      const s = known.get(b.seriesKey);
      if (s && !out.has(s.key)) out.set(s.key, s);
    }
    return { titles: [...out.values()].filter((s) => s.source !== 'external'), known };
  }, [favorites, wishlist, recents, bookmarks, downloaded]);
}

function TitlesTab() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const { titles } = useMyTitles();
  /** Tier of each title already recommended, by title key. */
  const [done, setDone] = useState<Map<string, Tier> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tier, setTier] = useState<Tier>('good');
  const [progress, setProgress] = useState<string | null>(null);

  const load = useCallback(() => {
    account
      .myRecommendations()
      .then((items) => setDone(new Map(items.map((r) => [`${r.source}:${r.seriesId}`, r.tier]))))
      .catch((e) => setError(friendly(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.myRecommendations]);
  useEffect(load, [load]);

  // Not yet recommended first.
  const rows = useMemo(
    () => (done ? [...titles].sort((a, b) => Number(done.has(a.key)) - Number(done.has(b.key))) : []),
    [titles, done],
  );
  const fresh = rows.filter((s) => !done?.has(s.key));

  if (error) return <Retry
        message={error}
        onRetry={() => {
          setError(null);
          load();
        }}
      />;
  if (!done) return <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />;
  if (!titles.length) {
    return <Text style={[styles.empty, { color: t.sub }]}>Add titles to your favorites or wishlist, or bookmark chapters, and they show here.</Text>;
  }

  const toggle = (key: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const allPicked = fresh.length > 0 && fresh.every((s) => picked.has(s.key));

  const send = async () => {
    const list = fresh.filter((s) => picked.has(s.key));
    let sent = 0;
    let failure: unknown = null;
    for (const s of list) {
      setProgress(`Recommending ${sent + 1} of ${list.length}…`);
      try {
        await account.recommend(s, tier, '');
        sent++;
        setDone((d) => new Map(d).set(s.key, tier));
      } catch (e) {
        failure = e;
        break; // most likely the daily limit or the connection; the rest would fail the same way
      }
    }
    setProgress(null);
    setPicked(new Set());
    if (failure) Alert.alert(sent ? `Recommended ${sent} of ${list.length}` : "Couldn't recommend them", friendly(failure));
    else Alert.alert('Recommended', `${plural(sent, 'title')} added to your recommendations as ${TIER_LABEL[tier]}.`);
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(s) => s.key}
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: insets.bottom + 24 }}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          <Text style={{ color: t.sub }}>
            {fresh.length ? `${plural(fresh.length, 'title')} not recommended yet, of ${titles.length}.` : `All ${plural(titles.length, 'title')} are recommended.`}
          </Text>
          {fresh.length ? (
            <>
              <View style={styles.tiers}>
                {TIER_ORDER.map((x) => (
                  <Pressable key={x} onPress={() => setTier(x)} style={[styles.chip, { backgroundColor: tier === x ? t.accent : t.card }]}>
                    <Text style={{ color: tier === x ? '#fff' : t.sub, fontSize: 13 }}>{TIER_LABEL[x]}</Text>
                  </Pressable>
                ))}
              </View>
              <BatchBar
                allPicked={allPicked}
                count={picked.size}
                busy={progress}
                noun="title"
                onToggleAll={() => setPicked(allPicked ? new Set() : new Set(fresh.map((s) => s.key)))}
                onSend={send}
              />
            </>
          ) : null}
        </View>
      }
      renderItem={({ item: s }) => {
        const tierDone = done.get(s.key);
        const on = picked.has(s.key);
        return (
          <Pressable
            disabled={!!tierDone || !!progress}
            onPress={() => toggle(s.key)}
            style={[styles.row, { backgroundColor: t.card, borderColor: tierDone ? 'transparent' : t.accent, opacity: tierDone ? 0.55 : 1 }]}
          >
            <Cover series={s} style={styles.thumb} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={2} style={{ color: t.text, fontWeight: '600' }}>
                {s.title}
              </Text>
              <Text style={{ color: tierDone ? t.sub : t.accent, fontSize: 12 }}>
                {tierDone ? `Recommended · ${TIER_LABEL[tierDone]}` : 'Not recommended yet'}
              </Text>
            </View>
            {tierDone ? (
              <Ionicons name="checkmark-circle" size={22} color={t.sub} />
            ) : (
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? t.accent : t.sub} />
            )}
          </Pressable>
        );
      }}
    />
  );
}

type MarkState = 'new' | 'listed' | 'suggested';
type Section = { series: Series; data: { mark: Bookmark; state: MarkState; label: string }[] };

function BookmarksTab() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { bookmarks } = useLibrary();
  const { find } = useRecs();
  const { known } = useMyTitles();
  /** Why each spot is already taken: on the title (author's or approved community) or suggested by this reader. */
  const [taken, setTaken] = useState<Map<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);

  const mine = useMemo(() => bookmarks.filter((b) => known.get(b.seriesKey) && known.get(b.seriesKey)!.source !== 'external'), [bookmarks, known]);
  const seriesKeys = [...new Set(mine.map((b) => b.seriesKey))].join(',');

  const load = useCallback(() => {
    const series = [...new Set(mine.map((b) => b.seriesKey))].map((k) => known.get(k)!);
    Promise.all([mySuggestions(), mapLimit(series, 4, async (s) => ({ s, items: await fetchCommunityBookmarks(s) }))])
      .then(([suggested, community]) => {
        const map = new Map<string, string>();
        for (const s of series) for (const b of find(s.key)?.bookmarks ?? []) map.set(spot(s.key, b.chapterId, b.page ?? 1), 'On the title (author)');
        for (const { s, items } of community) for (const b of items) map.set(spot(s.key, b.chapterId, b.page), 'On the title (community)');
        for (const g of suggested) {
          const key = `${g.source}:${g.seriesId}`;
          if (!map.has(spot(key, g.chapterId, g.page))) {
            map.set(spot(key, g.chapterId, g.page), g.status === 'rejected' ? 'Not accepted before · can be sent again' : `Suggested · ${g.status}`);
          }
        }
        setTaken(map);
      })
      .catch((e) => setError(friendly(e)));
    // Runs again when the set of titles changes, not on every bookmark edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKeys]);
  useEffect(load, [load]);

  const sections = useMemo<Section[]>(() => {
    if (!taken) return [];
    const bySeries = new Map<string, Section>();
    for (const b of mine) {
      const why = taken.get(spot(b.seriesKey, b.chapterId, b.page));
      const state: MarkState = !why || why.startsWith('Not accepted') ? 'new' : why.startsWith('Suggested') ? 'suggested' : 'listed';
      const sec = bySeries.get(b.seriesKey) ?? { series: known.get(b.seriesKey)!, data: [] };
      sec.data.push({ mark: b, state, label: why ?? (b.note.trim() ? 'Not recommended yet' : 'Needs a note before it can be recommended') });
      bySeries.set(b.seriesKey, sec);
    }
    const list = [...bySeries.values()];
    for (const s of list) s.data.sort((x, y) => Number(x.state !== 'new') - Number(y.state !== 'new'));
    // Titles with something left to recommend first.
    return list.sort((a, b) => Number(!a.data.some((d) => d.state === 'new')) - Number(!b.data.some((d) => d.state === 'new')));
  }, [mine, taken, known]);

  if (error) return <Retry
        message={error}
        onRetry={() => {
          setError(null);
          load();
        }}
      />;
  if (!taken) return <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />;
  if (!mine.length) return <Text style={[styles.empty, { color: t.sub }]}>You have no chapter bookmarks yet. Add them while reading.</Text>;

  const ready = sections.flatMap((s) => s.data.filter((d) => d.state === 'new' && d.mark.note.trim()).map((d) => d.mark));
  const fresh = sections.reduce((n, s) => n + s.data.filter((d) => d.state === 'new').length, 0);
  const allPicked = ready.length > 0 && ready.every((b) => picked.has(b.id));
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const send = async () => {
    const list = ready.filter((b) => picked.has(b.id));
    let sent = 0;
    let failure: unknown = null;
    for (const b of list) {
      setProgress(`Sending ${sent + 1} of ${list.length}…`);
      try {
        await submitBookmark(known.get(b.seriesKey)!, b);
        sent++;
        setTaken((m) => new Map(m).set(spot(b.seriesKey, b.chapterId, b.page), 'Suggested · pending'));
      } catch (e) {
        failure = e;
      }
    }
    setProgress(null);
    setPicked(new Set());
    if (failure) Alert.alert(sent ? `Sent ${sent} of ${list.length}` : "Couldn't send them", friendly(failure));
    else Alert.alert('Sent for review', `${plural(sent, 'bookmark')} will show up for everyone once an admin approves them.`);
  };

  return (
    <SectionList
      sections={sections}
      keyExtractor={(d) => d.mark.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 4 }}>
          <Text style={{ color: t.sub }}>
            {fresh ? `${plural(fresh, 'bookmark')} not recommended yet, of ${mine.length}.` : `All ${plural(mine.length, 'bookmark')} are listed or suggested.`}{' '}
            An admin reviews each one before others see it.
          </Text>
          {ready.length ? (
            <BatchBar
              allPicked={allPicked}
              count={picked.size}
              busy={progress}
              noun="bookmark"
              onToggleAll={() => setPicked(allPicked ? new Set() : new Set(ready.map((b) => b.id)))}
              onSend={send}
            />
          ) : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.secHead}>
          <Cover series={section.series} style={styles.secThumb} />
          <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', flex: 1 }}>
            {section.series.title}
          </Text>
        </View>
      )}
      renderItem={({ item: { mark: b, state, label } }) => {
        const can = state === 'new' && !!b.note.trim();
        const on = picked.has(b.id);
        return (
          <Pressable
            disabled={!can || !!progress}
            onPress={() => toggle(b.id)}
            style={[
              styles.row,
              { backgroundColor: t.card, borderColor: state === 'new' ? t.accent : 'transparent', opacity: state === 'new' ? 1 : 0.55, marginBottom: 8 },
            ]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: t.text, fontWeight: '600' }}>
                {b.chapterName} · p.{b.page}
              </Text>
              {b.note.trim() ? (
                <Text numberOfLines={2} style={{ color: t.sub, fontSize: 12 }}>
                  {b.note}
                </Text>
              ) : null}
              <Text style={{ color: state === 'new' && can ? t.accent : t.sub, fontSize: 12 }}>{label}</Text>
            </View>
            {state !== 'new' ? (
              <Ionicons name="checkmark-circle" size={22} color={t.sub} />
            ) : can ? (
              <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? t.accent : t.sub} />
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

/** Select all / clear, and the button that recommends what is selected. */
function BatchBar(p: { allPicked: boolean; count: number; busy: string | null; noun: string; onToggleAll: () => void; onSend: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.batch}>
      <Pressable disabled={!!p.busy} onPress={p.onToggleAll} style={[styles.selectAll, { borderColor: t.border }]}>
        <Ionicons name={p.allPicked ? 'checkbox' : 'square-outline'} size={18} color={p.allPicked ? t.accent : t.sub} />
        <Text style={{ color: t.text, fontSize: 13 }}>{p.allPicked ? 'Clear' : 'Select all new'}</Text>
      </Pressable>
      <Pressable
        disabled={!p.count || !!p.busy}
        onPress={p.onSend}
        style={[styles.send, { backgroundColor: t.accent, flex: 1, opacity: p.count && !p.busy ? 1 : 0.5 }]}
      >
        {p.busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="sparkles" size={16} color="#fff" />}
        <Text style={styles.sendText}>{p.busy ?? `Recommend ${p.count ? plural(p.count, p.noun) : 'selected'}`}</Text>
      </Pressable>
    </View>
  );
}

function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.center}>
      <Text style={{ color: t.danger, textAlign: 'center' }}>{message}</Text>
      <Pressable onPress={onRetry} style={[styles.send, { backgroundColor: t.accent }]}>
        <Text style={styles.sendText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  barTitle: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  empty: { textAlign: 'center', padding: 32, lineHeight: 20 },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  batch: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 11 },
  send: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18 },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, borderWidth: 1.5 },
  thumb: { width: 44, height: 60 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, marginBottom: 8 },
  secThumb: { width: 28, height: 38 },
});
