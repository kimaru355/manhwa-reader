import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '../components/Cover';
import { RecommendSheet } from '../components/RecommendSheet';
import { EmptyState } from '../components/EmptyState';
import { useAccount } from '../lib/account';
import { useDownloads } from '../lib/downloads';
import { useLibrary } from '../lib/library';
import { TIER_LABEL, useRecs } from '../lib/recs';
import { openReader, parseRef, useChapters, useCommunityBookmarks } from '../lib/series';
import { getSource } from '../lib/sources';
import { useTheme } from '../lib/theme';
import type { Bookmark } from '../lib/types';

export default function SeriesDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ref: string }>();
  const series = useMemo(() => parseRef(params.ref), [params.ref]);
  const { getProgress, isFavorite, toggleFavorite, isWishlisted, toggleWishlist, getBookmarks } = useLibrary();
  const { find } = useRecs();
  const dl = useDownloads();
  const { chapters, loading, error, reload, offline } = useChapters(series);
  const [newestFirst, setNewestFirst] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const account = useAccount();
  const communityMarks = useCommunityBookmarks(series);

  if (!series) {
    return (
      <View style={[styles.flex, { backgroundColor: t.bg, paddingTop: insets.top }]}>
        <EmptyState icon="alert-circle-outline" title="Title not found" />
      </View>
    );
  }

  const rec = find(series.key);
  const progress = getProgress(series.key);
  const resumeIdx = progress ? chapters.findIndex((c) => c.id === progress.chapterId) : -1;
  const fav = isFavorite(series.key);
  const wished = isWishlisted(series.key);
  const marksByChapter = new Map<string, Bookmark[]>();
  for (const b of getBookmarks(series.key)) marksByChapter.set(b.chapterId, [...(marksByChapter.get(b.chapterId) ?? []), b]);
  const authorByChapter = new Map<string, NonNullable<typeof rec>['bookmarks']>();
  for (const b of rec?.bookmarks ?? []) {
    authorByChapter.set(b.chapterId, [...(authorByChapter.get(b.chapterId) ?? []), b]);
  }

  const communityByChapter = new Map<string, typeof communityMarks>();
  for (const b of communityMarks) communityByChapter.set(b.chapterId, [...(communityByChapter.get(b.chapterId) ?? []), b]);

  const indexed = chapters.map((c, i) => ({ c, i }));
  const rows = newestFirst ? [...indexed].reverse() : indexed;
  const savedCount = dl.getDownloaded(series.key)?.chapters.length ?? 0;
  const pending = chapters.filter((c) => !dl.getChapter(series.key, c.id) && !dl.getJob(series.key, c.id));
  const waiting = dl.queue.filter((j) => j.series.key === series.key);
  const running = dl.started.includes(series.key);
  const sourceName = getSource(series.source)?.name ?? series.source;

  const startReading = () => {
    if (!chapters.length) return;
    if (progress && resumeIdx >= 0) openReader(series, progress.chapterId, progress.page);
    else openReader(series, chapters[0].id);
  };

  const addToDownloads = (list: typeof chapters) => {
    const n = dl.enqueue(series, list);
    if (n && Platform.OS === 'android') {
      ToastAndroid.show(`${n} chapter${n === 1 ? '' : 's'} added to Downloads`, ToastAndroid.SHORT);
    }
  };

  const downloadAll = () => {
    if (!pending.length) return;
    Alert.alert(`Download all ${pending.length} chapter${pending.length === 1 ? '' : 's'}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Yes', onPress: () => addToDownloads(pending) },
    ]);
  };

  const openRecommend = () => {
    if (account.user) setRecommendOpen(true);
    else {
      Alert.alert('Sign in to recommend', 'Recommending shares a title with others. An account is only needed for this, not for reading.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/account') },
      ]);
    }
  };

  const confirmDeleteChapter = (id: string, name: string) =>
    Alert.alert(`Delete "${name}"?`, 'Removes the downloaded copy from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => dl.removeChapter(series.key, id) },
    ]);

  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.barTitle, { color: t.text }]}>
          {series.title}
        </Text>
        <Pressable hitSlop={10} onPress={() => toggleWishlist(series)}>
          <Ionicons name={wished ? 'star' : 'star-outline'} size={26} color={wished ? t.accent : t.text} />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => toggleFavorite(series)}>
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={26} color={fav ? t.accent : t.text} />
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={({ c }) => c.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={t.accent} style={{ margin: 32 }} />
          ) : error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load chapters"
              message={error}
              action="Try again"
              onAction={reload}
            />
          ) : (
            <EmptyState icon="document-outline" title="No chapters available" />
          )
        }
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Cover series={series} style={styles.cover} />
              <View style={styles.heroInfo}>
                <Text style={[styles.title, { color: t.text }]}>{series.title}</Text>
                <Text style={{ color: t.sub }}>
                  {sourceName}
                  {chapters.length ? ` · ${chapters.length} chapters` : ''}
                  {communityMarks.length ? ` · ${communityMarks.length} community bookmark${communityMarks.length === 1 ? '' : 's'}` : ''}
                </Text>
                {rec ? (
                  <View style={[styles.tier, { backgroundColor: t.card }]}>
                    <Ionicons name="sparkles" size={12} color={t.accent} />
                    <Text style={{ color: t.accent, fontSize: 12, fontWeight: '600' }}>{TIER_LABEL[rec.tier]}</Text>
                  </View>
                ) : null}
                {progress && resumeIdx >= 0 ? (
                  <Text numberOfLines={1} style={{ color: t.sub }}>
                    Read to {chapters[resumeIdx].name}
                  </Text>
                ) : null}
              </View>
            </View>

            {rec?.note ? (
              <View style={[styles.note, { backgroundColor: t.card }]}>
                <Text style={{ color: t.sub, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>AUTHOR’S NOTE</Text>
                <Text style={{ color: t.text, lineHeight: 20 }}>{rec.note}</Text>
              </View>
            ) : null}

            <Pressable
              disabled={!chapters.length}
              style={[styles.cta, { backgroundColor: t.accent, opacity: chapters.length ? 1 : 0.5 }]}
              onPress={startReading}
            >
              <Ionicons name="book" size={18} color="#fff" />
              <Text style={styles.ctaText} numberOfLines={1}>
                {progress && resumeIdx >= 0 ? `Continue · ${chapters[resumeIdx].name}` : 'Start reading'}
              </Text>
            </Pressable>

            {chapters.length ? (
              <View style={styles.actions}>
                <Pressable
                  disabled={!pending.length}
                  onPress={downloadAll}
                  style={[styles.action, { borderColor: t.border, opacity: pending.length ? 1 : 0.5 }]}
                >
                  <Ionicons name="download-outline" size={18} color={t.text} />
                  <Text style={{ color: t.text }}>{pending.length ? 'Download all' : 'All downloaded'}</Text>
                </Pressable>
                {waiting.length ? (
                  <Pressable
                    onPress={() => (running ? dl.stop(series.key) : dl.start(series.key))}
                    style={[styles.action, { borderColor: t.accent }]}
                  >
                    <Ionicons name={running ? 'pause' : 'play'} size={18} color={t.accent} />
                    <Text style={{ color: t.accent }}>
                      {running ? 'Pause' : 'Start'} ({waiting.length})
                    </Text>
                  </Pressable>
                ) : null}
                {savedCount ? (
                  <Pressable
                    onPress={() =>
                      Alert.alert('Delete all downloads?', `Removes ${savedCount} saved chapters from this phone.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => dl.removeSeries(series.key) },
                      ])
                    }
                    style={[styles.action, { borderColor: t.border }]}
                  >
                    <Ionicons name="trash-outline" size={18} color={t.danger} />
                    <Text style={{ color: t.danger }}>Delete downloads</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {account.enabled ? (
              <Pressable onPress={openRecommend} style={[styles.action, { borderColor: t.border, marginHorizontal: 16, marginTop: 10 }]}>
                <Ionicons name="sparkles-outline" size={18} color={t.text} />
                <Text style={{ color: t.text }}>Recommend this title</Text>
              </Pressable>
            ) : null}

            {offline && chapters.length ? (
              <Text style={[styles.offline, { color: t.sub }]}>Offline — showing downloaded chapters only.</Text>
            ) : null}

            <View style={styles.listHead}>
              <Text style={[styles.listTitle, { color: t.text }]}>Chapters</Text>
              <Pressable style={styles.sort} onPress={() => setNewestFirst((v) => !v)}>
                <Ionicons name={newestFirst ? 'arrow-down' : 'arrow-up'} size={16} color={t.sub} />
                <Text style={{ color: t.sub }}>{newestFirst ? 'Newest first' : 'Oldest first'}</Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item: { c, i } }) => {
          const current = resumeIdx === i;
          const read = resumeIdx >= 0 && i < resumeIdx;
          const marks = marksByChapter.get(c.id) ?? [];
          const authorMarks = authorByChapter.get(c.id) ?? [];
          const crowd = communityByChapter.get(c.id) ?? [];
          const notes = [...authorMarks.map((b) => b?.note), ...crowd.map((b) => b.note), ...marks.map((b) => b.note)]
            .filter(Boolean)
            .join(' · ');
          const saved = dl.getChapter(series.key, c.id);
          const job = dl.getJob(series.key, c.id);
          return (
            <Pressable
              style={[styles.chapter, { borderBottomColor: t.border }]}
              onPress={() => openReader(series, c.id, current ? progress!.page : 1)}
              onLongPress={saved ? () => confirmDeleteChapter(c.id, c.name) : undefined}
            >
              <View style={styles.chapterText}>
                <Text numberOfLines={1} style={[styles.chapterName, { color: read ? t.sub : t.text }]}>
                  {c.name}
                </Text>
                {notes ? (
                  <Text numberOfLines={1} style={[styles.chapterNote, { color: t.accent }]}>
                    {notes}
                  </Text>
                ) : null}
              </View>
              {authorMarks.length ? <Ionicons name="sparkles" size={16} color={t.accent} /> : null}
              {crowd.length ? <Ionicons name="people" size={16} color={t.accent} /> : null}
              {marks.length ? <Ionicons name="bookmark" size={16} color={t.accent} /> : null}
              {current ? (
                <Text style={{ color: t.accent, fontSize: 12 }}>
                  p.{progress!.page}/{progress!.total || '?'}
                </Text>
              ) : read ? (
                <Ionicons name="checkmark-circle" size={18} color={t.sub} />
              ) : null}
              {saved ? (
                <Ionicons name="checkmark-done-circle" size={22} color={t.accent} />
              ) : job ? (
                <Pressable
                  hitSlop={10}
                  onPress={() => (job.state === 'error' ? dl.retry(series.key, c.id) : dl.cancel(series.key, c.id))}
                  style={styles.jobBtn}
                >
                  {job.state === 'error' ? (
                    <Ionicons name="refresh-circle" size={22} color={t.danger} />
                  ) : job.state === 'active' ? (
                    <>
                      <ActivityIndicator size="small" color={t.accent} />
                      <Text style={{ color: t.sub, fontSize: 11 }}>{job.total ? `${job.done}/${job.total}` : '…'}</Text>
                    </>
                  ) : (
                    <Ionicons name="time-outline" size={22} color={t.sub} />
                  )}
                </Pressable>
              ) : (
                <Pressable hitSlop={10} onPress={() => addToDownloads([c])}>
                  <Ionicons name="download-outline" size={22} color={t.sub} />
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />
      <RecommendSheet series={series} visible={recommendOpen} onClose={() => setRecommendOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 8 },
  barTitle: { flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  hero: { flexDirection: 'row', gap: 16, padding: 16 },
  cover: { width: 110, height: 152 },
  heroInfo: { flex: 1, gap: 6, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  note: { marginHorizontal: 16, marginBottom: 12, padding: 12, borderRadius: 12 },
  cta: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 10 },
  action: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  offline: { marginHorizontal: 16, marginTop: 10, fontSize: 12 },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  listTitle: { fontSize: 17, fontWeight: '700' },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chapterText: { flex: 1 },
  chapterName: { fontSize: 15 },
  chapterNote: { fontSize: 12, marginTop: 2 },
  jobBtn: { alignItems: 'center', minWidth: 30 },
});
