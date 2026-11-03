import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Pdf, { type PdfRef } from 'react-native-pdf';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLibrary } from '../lib/library';
import { ensureLocal, localPath, prune } from '../lib/pdfCache';

const BG = '#0B0B0D';
const ACCENT = '#B76CF0';
const ROW_HEIGHT = 52;

export default function Reader() {
  useKeepAwake();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; ch?: string; page?: string }>();
  const { getManhwa, saveProgress } = useLibrary();
  const manhwa = getManhwa(params.id);
  const chapters = manhwa?.chapters ?? [];

  const [chIdx, setChIdx] = useState(() =>
    Math.min(Math.max(Number(params.ch) || 0, 0), Math.max(chapters.length - 1, 0)),
  );
  const [startPage, setStartPage] = useState(() => Math.max(Number(params.page) || 1, 1));
  const [path, setPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(startPage);
  const [total, setTotal] = useState(0);
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const [chrome, setChrome] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const pdfRef = useRef<PdfRef>(null);
  const tracking = useRef(false);

  const chapter = chapters[chIdx];
  const prev = chapters[chIdx - 1];
  const next = chapters[chIdx + 1];

  useEffect(() => {
    if (!chapter) return;
    let alive = true;
    tracking.current = false;
    setPath(null);
    setError(null);
    setTotal(0);
    setPage(startPage);
    ensureLocal(chapter.uri).then(
      (p) => {
        if (!alive) return;
        setPath(p);
        // Warm the neighbours so chapter changes open instantly.
        if (next) ensureLocal(next.uri).catch(() => {});
        prune([p, localPath(chapter.uri), ...(next ? [localPath(next.uri)] : []), ...(prev ? [localPath(prev.uri)] : [])]);
      },
      (e) => alive && setError(String(e?.message ?? e)),
    );
    return () => {
      alive = false;
    };
    // startPage only matters at the moment the chapter changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter?.uri]);

  if (!manhwa || !chapter) {
    return (
      <View style={[styles.fill, styles.center]}>
        <Text style={styles.dim}>Chapter not found.</Text>
        <Pressable onPress={() => router.back()} style={styles.pill}>
          <Text style={styles.pillText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const goTo = (i: number, p = 1) => {
    if (i < 0 || i >= chapters.length) return;
    setStartPage(p);
    setChIdx(i);
    setListOpen(false);
    setChrome(true);
  };

  const jump = (p: number) => {
    const clamped = Math.min(Math.max(Math.round(p), 1), Math.max(total, 1));
    pdfRef.current?.setPage(clamped);
    setPage(clamped);
  };

  const atEnd = total > 0 && page >= total;

  return (
    <View style={styles.fill}>
      <StatusBar hidden={!chrome} style="light" />

      {path ? (
        <Pdf
          key={path}
          ref={pdfRef}
          source={{ uri: path }}
          page={startPage}
          style={styles.fill}
          fitPolicy={0}
          spacing={0}
          minScale={1}
          maxScale={4}
          horizontal={false}
          enablePaging={false}
          enableAntialiasing
          enableDoubleTapZoom
          trustAllCerts={false}
          renderActivityIndicator={() => <ActivityIndicator color={ACCENT} size="large" />}
          onLoadComplete={(n) => {
            setTotal(n);
            // Ignore the initial page event so a fresh open can't overwrite saved progress.
            setTimeout(() => (tracking.current = true), 600);
          }}
          onPageChanged={(p, n) => {
            setPage(p);
            setTotal(n);
            if (tracking.current) {
              saveProgress({ manhwaId: manhwa.id, chapterIndex: chIdx, page: p, total: n });
            }
          }}
          onPageSingleTap={() => setChrome((v) => !v)}
          onError={(e) => setError(e.message)}
        />
      ) : error ? (
        <View style={[styles.fill, styles.center]}>
          <Text style={styles.dim}>Couldn't open this chapter.</Text>
          <Text style={[styles.dim, { fontSize: 12 }]}>{error}</Text>
          <Pressable onPress={() => goTo(chIdx, startPage)} style={styles.pill}>
            <Text style={styles.pillText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.fill, styles.center]}>
          <ActivityIndicator color={ACCENT} size="large" />
        </View>
      )}

      {atEnd ? (
        <View style={[styles.endWrap, { bottom: chrome ? insets.bottom + 150 : insets.bottom + 32 }]} pointerEvents="box-none">
          {next ? (
            <Pressable style={styles.pill} onPress={() => goTo(chIdx + 1)}>
              <Text style={styles.pillText}>Next: {next.name}</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </Pressable>
          ) : (
            <View style={[styles.pill, { backgroundColor: '#2A2A30' }]}>
              <Text style={styles.pillText}>Last chapter reached</Text>
            </View>
          )}
        </View>
      ) : null}

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
                {manhwa.title}
              </Text>
            </View>
            <Pressable hitSlop={12} onPress={() => setListOpen(true)}>
              <Ionicons name="list" size={26} color="#fff" />
            </Pressable>
          </View>

          <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.pageLabel}>
              {scrubbing ?? page} / {total || '–'}
            </Text>
            <View style={styles.sliderRow}>
              <Pressable hitSlop={10} disabled={!prev} onPress={() => goTo(chIdx - 1)} style={!prev && styles.off}>
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
              <Pressable hitSlop={10} disabled={!next} onPress={() => goTo(chIdx + 1)} style={!next && styles.off}>
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
            keyExtractor={(c) => c.uri}
            initialScrollIndex={chIdx}
            getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
            renderItem={({ item, index }) => (
              <Pressable style={styles.sheetRow} onPress={() => goTo(index)}>
                <Text numberOfLines={1} style={[styles.sheetName, index === chIdx && { color: ACCENT, fontWeight: '700' }]}>
                  {item.name}
                </Text>
                {index === chIdx ? <Ionicons name="bookmark" size={18} color={ACCENT} /> : null}
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
