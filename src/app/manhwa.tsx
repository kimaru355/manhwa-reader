import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Cover } from '../components/Cover';
import { EmptyState } from '../components/EmptyState';
import { useLibrary } from '../lib/library';
import { useTheme } from '../lib/theme';
import type { Bookmark } from '../lib/types';

const openReader = (id: string, chapter: number, page = 1) =>
  router.push({ pathname: '/reader', params: { id, ch: String(chapter), page: String(page) } });

export default function ManhwaDetail() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getManhwa, getProgress, isFavorite, toggleFavorite, isWishlisted, toggleWishlist, getBookmarks } =
    useLibrary();
  const [newestFirst, setNewestFirst] = useState(false);

  const m = getManhwa(id);
  if (!m) {
    return (
      <View style={[styles.flex, { backgroundColor: t.bg, paddingTop: insets.top }]}>
        <EmptyState icon="alert-circle-outline" title="Manhwa not found" message="It may have been removed from your folders." />
      </View>
    );
  }

  const progress = getProgress(m.id);
  const fav = isFavorite(m.id);
  const wished = isWishlisted(m.id);
  const marksByChapter = new Map<string, Bookmark[]>();
  for (const b of getBookmarks(m.id)) marksByChapter.set(b.chapterUri, [...(marksByChapter.get(b.chapterUri) ?? []), b]);
  const indexed = m.chapters.map((c, i) => ({ c, i }));
  const rows = newestFirst ? [...indexed].reverse() : indexed;
  const resume = progress && m.chapters[progress.chapterIndex] ? progress : null;

  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.barTitle, { color: t.text }]}>
          {m.title}
        </Text>
        <Pressable hitSlop={10} onPress={() => toggleWishlist(m.id)}>
          <Ionicons name={wished ? 'star' : 'star-outline'} size={26} color={wished ? t.accent : t.text} />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => toggleFavorite(m.id)}>
          <Ionicons name={fav ? 'heart' : 'heart-outline'} size={26} color={fav ? t.accent : t.text} />
        </Pressable>
      </View>

      <FlatList
        data={rows}
        keyExtractor={({ c }) => c.uri}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        ListHeaderComponent={
          <View>
            <View style={styles.hero}>
              <Cover manhwa={m} style={styles.cover} />
              <View style={styles.heroInfo}>
                <Text style={[styles.title, { color: t.text }]}>{m.title}</Text>
                <Text style={{ color: t.sub }}>
                  {m.chapters.length} chapter{m.chapters.length === 1 ? '' : 's'}
                </Text>
                {resume ? (
                  <Text numberOfLines={1} style={{ color: t.sub }}>
                    Read to {m.chapters[resume.chapterIndex].name}
                  </Text>
                ) : null}
              </View>
            </View>
            <Pressable
              style={[styles.cta, { backgroundColor: t.accent }]}
              onPress={() => (resume ? openReader(m.id, resume.chapterIndex, resume.page) : openReader(m.id, 0))}
            >
              <Ionicons name="book" size={18} color="#fff" />
              <Text style={styles.ctaText} numberOfLines={1}>
                {resume ? `Continue · ${m.chapters[resume.chapterIndex].name}` : 'Start reading'}
              </Text>
            </Pressable>
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
          const current = resume?.chapterIndex === i;
          const read = !!resume && i < resume.chapterIndex;
          const marks = marksByChapter.get(c.uri) ?? [];
          const notes = marks.map((b) => b.note).filter(Boolean).join(' · ');
          return (
            <Pressable
              style={[styles.chapter, { borderBottomColor: t.border }]}
              onPress={() => openReader(m.id, i, current ? resume!.page : 1)}
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
              {marks.length ? <Ionicons name="bookmark" size={16} color={t.accent} /> : null}
              {current ? (
                <Text style={{ color: t.accent, fontSize: 12 }}>
                  p.{resume!.page}/{resume!.total || '?'}
                </Text>
              ) : read ? (
                <Ionicons name="checkmark-circle" size={18} color={t.sub} />
              ) : null}
            </Pressable>
          );
        }}
      />
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
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  listTitle: { fontSize: 17, fontWeight: '700' },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    paddingVertical: 8,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  chapterText: { flex: 1 },
  chapterName: { fontSize: 15 },
  chapterNote: { fontSize: 12, marginTop: 2 },
});
