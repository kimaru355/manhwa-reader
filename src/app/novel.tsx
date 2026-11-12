import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../components/EmptyState';
import { friendly, toastError } from '../lib/errors';
import { useLibrary } from '../lib/library';
import { parseRef, useChapters } from '../lib/series';
import { getSource } from '../lib/sources';
import { useTheme } from '../lib/theme';

const SIZE_KEY = 'novelFontSize1';
const MIN = 14;
const MAX = 30;

/** Reads a novel chapter as text, with previous/next chapter and a text size setting. */
export default function Novel() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ref?: string; ch?: string }>();
  const series = parseRef(params.ref);
  const { chapters } = useChapters(series);
  const { saveProgress } = useLibrary();
  const [chapterId, setChapterId] = useState(params.ch ?? '');
  const [paras, setParas] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [size, setSize] = useState(18);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const index = chapters.findIndex((c) => c.id === chapterId);
  const chapter = index >= 0 ? chapters[index] : undefined;

  useEffect(() => {
    AsyncStorage.getItem(SIZE_KEY)
      .then((v) => {
        const n = Number(v);
        if (n >= MIN && n <= MAX) setSize(n);
      })
      .catch(() => {});
  }, []);

  const resize = (delta: number) =>
    setSize((s) => {
      const n = Math.min(MAX, Math.max(MIN, s + delta));
      AsyncStorage.setItem(SIZE_KEY, String(n)).catch(() => {});
      return n;
    });

  useEffect(() => {
    const source = series ? getSource(series.source) : undefined;
    if (!series || !source?.text || !chapter) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParas(null);
    setError(null);
    source
      .text(series, chapter)
      .then((p) => {
        if (!alive) return;
        setParas(p);
        scroll.current?.scrollTo({ y: 0, animated: false });
        saveProgress({ series, chapterId: chapter.id, chapterName: chapter.name, page: 1, total: 1 });
      })
      .catch((e) => {
        if (!alive) return;
        setError(friendly(e));
        toastError(e);
      });
    return () => {
      alive = false;
    };
    // The chapter is identified by its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series?.key, chapter?.id, attempt]);

  if (!series) return <EmptyState icon="alert-circle-outline" title="Couldn't open this novel" />;

  const go = (delta: number) => {
    const next = chapters[index + delta];
    if (next) setChapterId(next.id);
  };

  const nav = (
    <View style={styles.nav}>
      <Pressable disabled={index <= 0} onPress={() => go(-1)} style={[styles.navBtn, { borderColor: t.border, opacity: index > 0 ? 1 : 0.4 }]}>
        <Ionicons name="chevron-back" size={18} color={t.text} />
        <Text style={{ color: t.text }}>Previous</Text>
      </Pressable>
      <Pressable
        disabled={index < 0 || index >= chapters.length - 1}
        onPress={() => go(1)}
        style={[styles.navBtn, { borderColor: t.accent, backgroundColor: t.accent, opacity: index >= 0 && index < chapters.length - 1 ? 1 : 0.4 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Next</Text>
        <Ionicons name="chevron-forward" size={18} color="#fff" />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <View style={[styles.bar, { borderBottomColor: t.border }]}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={t.text} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.barTitle, { color: t.text }]}>
          {chapter?.name ?? series.title}
        </Text>
        <Pressable hitSlop={10} onPress={() => resize(-2)}>
          <Ionicons name="remove-circle-outline" size={24} color={t.sub} />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => resize(2)}>
          <Ionicons name="add-circle-outline" size={24} color={t.sub} />
        </Pressable>
      </View>

      {error ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load this chapter" message={error} action="Try again" onAction={() => setAttempt((n) => n + 1)} />
      ) : !paras ? (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} size="large" />
        </View>
      ) : (
        <ScrollView ref={scroll} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
          {paras.map((p, i) => (
            <Text key={i} selectable style={{ color: t.text, fontSize: size, lineHeight: size * 1.6, marginBottom: size * 0.9 }}>
              {p}
            </Text>
          ))}
          {nav}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  barTitle: { flex: 1, fontSize: 16, fontWeight: '600' },
  body: { padding: 18 },
  nav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
});
