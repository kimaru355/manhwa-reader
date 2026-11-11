import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image as RNImage,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BookmarksSheet } from '../components/BookmarksSheet';
import { StatusPill } from '../components/StatusPill';
import { useAccount } from '../lib/account';
import { submitBookmark } from '../lib/community';
import { useDownloads } from '../lib/downloads';
import { friendly, toastError } from '../lib/errors';
import { chapterDir, pruneTemp } from '../lib/files';
import { useLibrary } from '../lib/library';
import { AHEAD_INITIAL, AHEAD_MIN, AHEAD_STEP, loadOnlineChapter } from '../lib/prefetch';
import { useRecs } from '../lib/recs';
import { parseRef, useChapters, useCommunityBookmarks } from '../lib/series';
import type { Bookmark, Chapter } from '../lib/types';
import { mapLimit } from '../lib/util';

const BG = '#0B0B0D';
const ACCENT = '#B76CF0';
const ROW_HEIGHT = 52;

type Loaded = { uris: string[]; ratios: number[] };

/** Index of the last offset that is <= y. */
function indexAt(offsets: number[], y: number) {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export default function Reader() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ ref: string; ch?: string; page?: string }>();
  const series = useMemo(() => parseRef(params.ref), [params.ref]);
  const { saveProgress, getBookmarks, addBookmark, removeBookmark, updateBookmark } = useLibrary();
  const { find } = useRecs();
  const dl = useDownloads();
  const { chapters } = useChapters(series);
  const communityMarks = useCommunityBookmarks(series);
  const account = useAccount();

  const [chId, setChId] = useState(params.ch ?? '');
  const [startPage, setStartPage] = useState(() => Math.max(Number(params.page) || 1, 1));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(startPage);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [chrome, setChrome] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [marksOpen, setMarksOpen] = useState(false);
  const listRef = useRef<FlatList<string>>(null);
  const tracking = useRef(false);
  // Last chapter index that has been loaded ahead of the reader (-1 = none yet).
  const cachedThrough = useRef(-1);

  const idx = chapters.findIndex((c) => c.id === chId);
  // A downloaded chapter opens without waiting for the chapter list to load.
  const chapter: Chapter | undefined = chapters[idx] ?? dl.getChapter(series?.key ?? '', chId);
  const prev = idx > 0 ? chapters[idx - 1] : undefined;
  const next = idx >= 0 ? chapters[idx + 1] : undefined;
  const total = loaded?.uris.length ?? 0;

  useEffect(() => {
    if (!series || !chapter) return;
    let alive = true;
    tracking.current = false;
    // Resetting for the new chapter before it loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    setPage(startPage);
    (async () => {
      const saved = dl.getChapter(series.key, chapter.id);
      let dir: string;
      let names: string[];
      if (saved) {
        dir = chapterDir(series.key, chapter.id, true);
        names = saved.files;
      } else {
        // The whole chapter is fetched at full quality before it opens, so nothing loads mid-read.
        const res = await loadOnlineChapter(
          series,
          chapter,
          (done, tot) => alive && setProgress({ done, total: tot }),
          () => !alive,
        );
        dir = res.dir;
        names = res.names;
      }
      const uris = names.map((n) => `${dir}${n}`);
      const ratios = await mapLimit(
        uris,
        8,
        (uri) =>
          new Promise<number>((resolve) =>
            RNImage.getSize(
              uri,
              (w, h) => resolve(w > 0 ? h / w : 1.4),
              () => resolve(1.4),
            ),
          ),
      );
      if (!alive) return;
      setLoaded({ uris, ratios });
      if (!saved) pruneTemp();
      // Ignore the initial scroll so a fresh open can't overwrite saved progress.
      setTimeout(() => alive && (tracking.current = true), 600);
    })().catch((e) => {
      if (!alive || String(e?.message) === 'Cancelled') return;
      setError(friendly(e));
      toastError(e);
    });
    return () => {
      alive = false;
    };
    // Only a different chapter (or a retry) should reload; startPage is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series?.key, chapter?.id, attempt]);

  const heights = useMemo(() => loaded?.ratios.map((r) => Math.max(Math.round(r * width), 1)) ?? [], [loaded, width]);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = 0;
    for (const h of heights) {
      out.push(y);
      y += h;
    }
    return out;
  }, [heights]);

  useEffect(() => {
    if (!series || !chapter || !tracking.current || !total) return;
    saveProgress({ series, chapterId: chapter.id, chapterName: chapter.name, page, total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, total]);

  // Read-ahead: keep upcoming chapters on disk so the next one opens instantly. Ten load first, and five
  // more whenever five or fewer are left. Failures are silent; it simply tries again later.
  useEffect(() => {
    if (!series || !loaded || idx < 0) return;
    const last = chapters.length - 1;
    let through = cachedThrough.current;
    if (through < idx) through = idx + AHEAD_INITIAL;
    else if (through - idx <= AHEAD_MIN) through += AHEAD_STEP;
    through = Math.min(through, last);
    let alive = true;
    (async () => {
      const from = Math.max(cachedThrough.current, idx) + 1;
      for (let i = from; i <= through && alive; i++) {
        const next = chapters[i];
        if (dl.getChapter(series.key, next.id)) {
          cachedThrough.current = i;
          continue;
        }
        try {
          await loadOnlineChapter(series, next, undefined, () => !alive);
          cachedThrough.current = i;
        } catch {
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
    // Re-evaluated when the reader moves to another chapter or finishes loading one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, loaded, chapters.length]);

  if (!series || !chapter) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Text style={styles.dim}>{series && chapters.length === 0 ? 'Loading…' : 'Chapter not found.'}</Text>
        <Pressable onPress={() => router.back()} style={styles.pill}>
          <Text style={styles.pillText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const goTo = (c: Chapter | undefined, p = 1) => {
    if (!c) return;
    setStartPage(p);
    setChId(c.id);
    setListOpen(false);
    setChrome(true);
  };

  const jump = (p: number) => {
    const clamped = Math.min(Math.max(Math.round(p), 1), Math.max(total, 1));
    listRef.current?.scrollToIndex({ index: clamped - 1, animated: false });
    setPage(clamped);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!offsets.length) return;
    const y = e.nativeEvent.contentOffset.y;
    const p = indexAt(offsets, y + height * 0.35) + 1;
    setPage((cur) => (cur === p ? cur : p));
  };

  const atEnd = total > 0 && page >= total;
  const rec = find(series.key);
  const author: Bookmark[] = (rec?.bookmarks ?? []).map((b, i) => ({
    id: `author-${i}`,
    seriesKey: series.key,
    chapterId: b.chapterId,
    chapterName: b.chapterName ?? chapters.find((c) => c.id === b.chapterId)?.name ?? b.chapterId,
    page: b.page ?? 1,
    note: b.note ?? '',
    ts: 0,
  }));
  const community: Bookmark[] = communityMarks.map((b) => ({
    id: `community-${b.id}`,
    seriesKey: series.key,
    chapterId: b.chapterId,
    chapterName: b.chapterName,
    page: b.page,
    note: b.note ?? '',
    ts: 0,
  }));
  const bookmarks = getBookmarks(series.key);

  // Suggesting a bookmark to everyone needs an account; an admin approves it before anyone sees it.
  const shareBookmark = (b: Bookmark) => {
    if (!account.user) {
      Alert.alert('Sign in to share', 'An account is only needed to share bookmarks, not to read.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/account') },
      ]);
      return;
    }
    Alert.alert('Suggest this bookmark?', `${b.chapterName} · p.${b.page}
An admin reviews it before anyone else sees it.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Suggest',
        onPress: () =>
          submitBookmark(series, b)
            .then(() => Alert.alert('Sent for review', 'It will show up for everyone once it is approved.'))
            .catch((e) => Alert.alert("Couldn't send it", friendly(e))),
      },
    ]);
  };
  const chapterMarked = bookmarks.some((b) => b.chapterId === chapter.id);

  const openBookmark = (b: Bookmark) => {
    const target = chapters.find((c) => c.id === b.chapterId);
    if (!target) return;
    setMarksOpen(false);
    if (target.id === chapter.id) jump(b.page);
    else goTo(target, b.page);
  };

  return (
    <View style={styles.fill}>
      <StatusBar hidden={!chrome} style="light" />

      {loaded ? (
        <FlatList
          key={`${chapter.id}-${attempt}`}
          ref={listRef}
          data={loaded.uris}
          keyExtractor={(u) => u}
          initialScrollIndex={Math.min(startPage - 1, loaded.uris.length - 1)}
          getItemLayout={(_, i) => ({ length: heights[i], offset: offsets[i], index: i })}
          onScroll={onScroll}
          scrollEventThrottle={32}
          windowSize={7}
          maxToRenderPerBatch={4}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => setChrome((v) => !v)}>
              <Image
                source={{ uri: item }}
                style={{ width, height: heights[index] }}
                contentFit="fill"
                transition={0}
                recyclingKey={item}
              />
            </Pressable>
          )}
          ListFooterComponent={
            <View style={styles.footer}>
              {next ? (
                <Pressable style={styles.pill} onPress={() => goTo(next)}>
                  <Text style={styles.pillText}>Next: {next.name}</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </Pressable>
              ) : (
                <Text style={styles.dim}>Last chapter reached</Text>
              )}
            </View>
          }
        />
      ) : error ? (
        <View style={[styles.fill, styles.center]}>
          <Text style={styles.dim}>{"Couldn't open this chapter."}</Text>
          <Text style={[styles.dim, { fontSize: 12 }]}>{error}</Text>
          <Pressable onPress={() => setAttempt((n) => n + 1)} style={styles.pill}>
            <Text style={styles.pillText}>Retry</Text>
          </Pressable>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.dim}>Go back</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.fill, styles.center]}>
          <ActivityIndicator color={ACCENT} size="large" />
          <Text style={styles.dim}>
            {progress.total ? `Loading chapter… ${progress.done}/${progress.total}` : 'Loading chapter…'}
          </Text>
        </View>
      )}

      {loaded && atEnd && next ? (
        <View style={[styles.endWrap, { bottom: chrome ? insets.bottom + 150 : insets.bottom + 32 }]} pointerEvents="box-none">
          <Pressable style={styles.pill} onPress={() => goTo(next)}>
            <Text style={styles.pillText}>Next: {next.name}</Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      {!chrome ? <StatusPill bottom={insets.bottom + 4} /> : null}

      {chrome ? (
        <>
          <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
            <Pressable hitSlop={12} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
            </Pressable>
            <View style={styles.topTitle}>
              <Text numberOfLines={1} style={styles.title}>
                {chapter.name}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {series.title}
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={() => setMarksOpen(true)}>
              <Ionicons name={chapterMarked ? 'bookmark' : 'bookmark-outline'} size={24} color={chapterMarked ? ACCENT : '#fff'} />
            </Pressable>
            <Pressable hitSlop={10} onPress={() => setListOpen(true)}>
              <Ionicons name="list" size={26} color="#fff" />
            </Pressable>
          </View>

          <BookmarksSheet
            visible={marksOpen}
            onClose={() => setMarksOpen(false)}
            chapters={chapters}
            current={{ chapter, page }}
            bookmarks={bookmarks}
            author={author}
            community={community}
            onShare={account.enabled ? shareBookmark : undefined}
            onAdd={(note) =>
              addBookmark({ seriesKey: series.key, chapterId: chapter.id, chapterName: chapter.name, page, note })
            }
            onOpen={openBookmark}
            onRemove={removeBookmark}
            onEdit={updateBookmark}
          />

          <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.pageLabel}>
              {scrubbing ?? page} / {total || '–'}
            </Text>
            <View style={styles.sliderRow}>
              <Pressable hitSlop={10} disabled={!prev} onPress={() => goTo(prev)} style={!prev && styles.off}>
                <Ionicons name="play-skip-back" size={22} color="#fff" />
              </Pressable>
              <Slider
                style={styles.slider}
                minimumValue={1}
                maximumValue={Math.max(total, 2)}
                step={1}
                value={page}
                disabled={total < 2}
                minimumTrackTintColor={ACCENT}
                maximumTrackTintColor="#555"
                thumbTintColor="#fff"
                onValueChange={(v) => setScrubbing(Math.round(v))}
                onSlidingComplete={(v) => {
                  setScrubbing(null);
                  jump(v);
                }}
              />
              <Pressable hitSlop={10} disabled={!next} onPress={() => goTo(next)} style={!next && styles.off}>
                <Ionicons name="play-skip-forward" size={22} color="#fff" />
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      <Modal visible={listOpen} transparent animationType="slide" onRequestClose={() => setListOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setListOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <Text style={styles.sheetTitle}>Jump to chapter</Text>
          <FlatList
            data={chapters}
            keyExtractor={(c) => c.id}
            initialScrollIndex={Math.max(idx, 0)}
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            renderItem={({ item }) => (
              <Pressable style={styles.sheetRow} onPress={() => goTo(item)}>
                <Text numberOfLines={1} style={[styles.sheetName, item.id === chapter.id && { color: ACCENT, fontWeight: '700' }]}>
                  {item.name}
                </Text>
                {item.id === chapter.id ? <Ionicons name="play" size={16} color={ACCENT} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: BG },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  dim: { color: '#9A9AA4', textAlign: 'center' },
  footer: { alignItems: 'center', paddingVertical: 48 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  pillText: { color: '#fff', fontWeight: '600' },
  endWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: 'rgba(11,11,13,0.92)',
  },
  topTitle: { flex: 1 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  subtitle: { color: '#9A9AA4', fontSize: 12 },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(11,11,13,0.92)',
  },
  pageLabel: { color: '#fff', textAlign: 'center', fontSize: 13, marginBottom: 2 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slider: { flex: 1, height: 40 },
  off: { opacity: 0.3 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: '60%', backgroundColor: '#1A1A1F', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  sheetTitle: { color: '#fff', fontSize: 16, fontWeight: '700', padding: 16 },
  sheetRow: {
    height: ROW_HEIGHT,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetName: { flex: 1, color: '#E6E6EA', fontSize: 15 },
});
