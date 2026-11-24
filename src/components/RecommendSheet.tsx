import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '../lib/account';
import { fetchCommunityBookmarks, mySuggestions, submitBookmark } from '../lib/community';
import { friendly } from '../lib/errors';
import { useLibrary } from '../lib/library';
import { TIER_LABEL, TIER_ORDER, useRecs } from '../lib/recs';
import type { Bookmark, Series, Tier } from '../lib/types';

const ACCENT = '#B76CF0';

type Tab = 'title' | 'bookmarks';

/** A spot in a title; two bookmarks on the same page are the same bookmark here. */
const spot = (chapterId: string, page: number) => `${chapterId}|${page}`;

/**
 * Lets a signed-in user recommend a title with a tier and a short note, or suggest their own chapter bookmarks of it
 * to everyone (an admin reviews them first).
 */
export function RecommendSheet({ series, visible, onClose }: { series: Series; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('title');
  // Opens on the title each time.
  const close = () => {
    setTab('title');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior="padding">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <Text numberOfLines={1} style={styles.title}>
            Recommend “{series.title}”
          </Text>
          <View style={styles.tabs}>
            {(
              [
                ['title', 'Title'],
                ['bookmarks', 'Chapter bookmarks'],
              ] as const
            ).map(([value, label]) => (
              <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && { backgroundColor: ACCENT }]}>
                <Text style={{ color: tab === value ? '#fff' : '#9A9AA4', fontSize: 13, fontWeight: '600' }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {tab === 'title' ? <TitleTab series={series} onClose={close} /> : <BookmarksTab series={series} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TitleTab({ series, onClose }: { series: Series; onClose: () => void }) {
  const { recommend } = useAccount();
  const [tier, setTier] = useState<Tier>('good');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await recommend(series, tier, note);
      setNote('');
      onClose();
      Alert.alert('Recommended', `"${series.title}" was added to your recommendations.`);
    } catch (e) {
      Alert.alert("Couldn't save it", friendly(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.tiers}>
        {TIER_ORDER.map((x) => (
          <Pressable key={x} onPress={() => setTier(x)} style={[styles.chip, tier === x && { backgroundColor: ACCENT }]}>
            <Text style={{ color: tier === x ? '#fff' : '#9A9AA4', fontSize: 13 }}>{TIER_LABEL[x]}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Why do you recommend it? (optional)"
        placeholderTextColor="#777"
        style={styles.input}
        maxLength={500}
        multiline
      />
      <Pressable disabled={busy} style={[styles.save, { opacity: busy ? 0.6 : 1 }]} onPress={submit}>
        {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles" size={16} color="#fff" />}
        <Text style={styles.saveText}>Recommend</Text>
      </Pressable>
    </>
  );
}

/**
 * The user's own bookmarks of this title that the title doesn't already have: not among the author's bookmarks,
 * the approved community ones, or ones this user already suggested (a rejected one can't be suggested again).
 */
function BookmarksTab({ series }: { series: Series }) {
  const { getBookmarks } = useLibrary();
  const { find } = useRecs();
  const mine = getBookmarks(series.key);
  const [listed, setListed] = useState<Set<string> | null>(null);
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const author = (find(series.key)?.bookmarks ?? []).map((b) => spot(b.chapterId, b.page ?? 1));
    Promise.all([fetchCommunityBookmarks(series), mySuggestions()])
      .then(([community, suggested]) => {
        if (!alive) return;
        setListed(
          new Set([
            ...author,
            ...community.map((b) => spot(b.chapterId, b.page)),
            ...suggested
              .filter((s) => s.source === series.source && s.seriesId === series.id)
              .map((s) => spot(s.chapterId, s.page)),
          ]),
        );
      })
      .catch((e) => alive && setError(friendly(e)));
    return () => {
      alive = false;
    };
    // `series` is identified by its key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series.key]);

  if (error) return <Text style={styles.empty}>{error}</Text>;
  if (!listed) return <ActivityIndicator color={ACCENT} style={{ marginVertical: 24 }} />;
  if (!mine.length) {
    return <Text style={styles.empty}>You have no bookmarks in this title. Add them while reading, then recommend them here.</Text>;
  }

  const open = mine.filter((b) => !listed.has(spot(b.chapterId, b.page)));
  if (!open.length) return <Text style={styles.empty}>All your bookmarks of this title are already listed or have been reviewed.</Text>;
  const ready = open.filter((b) => b.note.trim());

  /** Sends bookmarks one at a time; the ones sent count as listed from then on. */
  const send = async (list: Bookmark[]) => {
    const ids = new Set(list.map((b) => b.id));
    setSending((s) => new Set([...s, ...ids]));
    let sent = 0;
    let failure: unknown = null;
    for (const b of list) {
      try {
        await submitBookmark(series, b);
        sent++;
        setListed((l) => new Set([...(l ?? []), spot(b.chapterId, b.page)]));
      } catch (e) {
        failure = e;
      }
    }
    setSending((s) => new Set([...s].filter((id) => !ids.has(id))));
    if (failure) Alert.alert(sent ? `Sent ${sent} of ${list.length}` : "Couldn't send it", friendly(failure));
    else Alert.alert('Sent for review', `${sent === 1 ? 'It' : `${sent} bookmarks`} will show up for everyone once approved.`);
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.hint}>An admin reviews each bookmark before anyone else sees it.</Text>
      {ready.length ? (
        <Pressable disabled={sending.size > 0} style={[styles.save, { opacity: sending.size ? 0.6 : 1 }]} onPress={() => send(ready)}>
          <Ionicons name="sparkles" size={16} color="#fff" />
          <Text style={styles.saveText}>Recommend all ({ready.length})</Text>
        </Pressable>
      ) : null}
      <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8 }}>
        {open.map((b) => {
          const busy = sending.has(b.id);
          const noted = !!b.note.trim();
          return (
            <View key={b.id} style={styles.mark}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '600' }}>
                  {b.chapterName} · p.{b.page}
                </Text>
                <Text numberOfLines={2} style={{ color: noted ? '#BDBDC6' : '#8A8A94', fontSize: 12 }}>
                  {noted ? b.note : 'Add a note in the reader first, so others know why this page is worth reading.'}
                </Text>
              </View>
              {busy ? (
                <ActivityIndicator color={ACCENT} />
              ) : (
                <Pressable
                  disabled={!noted || sending.size > 0}
                  onPress={() => send([b])}
                  style={[styles.markBtn, { opacity: noted && !sending.size ? 1 : 0.4 }]}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Recommend</Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#1A1A1F', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 12 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  tabs: { flexDirection: 'row', backgroundColor: '#26262C', borderRadius: 18, padding: 3 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 16 },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#26262C' },
  input: { backgroundColor: '#26262C', color: '#fff', borderRadius: 10, padding: 12, minHeight: 80, fontSize: 15, textAlignVertical: 'top' },
  save: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 13 },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  empty: { color: '#9A9AA4', textAlign: 'center', marginVertical: 20, lineHeight: 20 },
  hint: { color: '#8A8A94', fontSize: 12 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#26262C', borderRadius: 10, padding: 10 },
  markBtn: { backgroundColor: ACCENT, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
});
