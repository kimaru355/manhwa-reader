import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipRow } from '../components/ChipRow';
import { useAccount } from '../lib/account';
import {
  applyRooms,
  CHAT_MAX,
  CHAT_POLL_MS,
  DEFAULT_ROOMS,
  deleteMessage,
  fetchMessages,
  fetchRooms,
  markSeen,
  sendMessage,
  useChatUnread,
  type ChatMessage,
  type ChatRoom,
  type ChatRoomId,
} from '../lib/chat';
import { friendly } from '../lib/errors';
import { useTheme } from '../lib/theme';

const time = (iso: string) => {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return new Date().toDateString() === d.toDateString() ? hm : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${hm}`;
};

/**
 * Public chat rooms. Anyone can read; signed-in readers can post. Not live: the room is fetched every 30 s while
 * this screen is open, after sending, and with the refresh button, which keeps the load on the server low.
 */
export default function Chat() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const unread = useChatUnread();
  const [rooms, setRooms] = useState<ChatRoom[]>(DEFAULT_ROOMS);
  const [room, setRoom] = useState<ChatRoomId>('global');
  const [items, setItems] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Date | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const latest = useRef<{ room: ChatRoomId; items: ChatMessage[] }>({ room: 'global', items: [] });
  useEffect(() => {
    latest.current = { room, items };
  });

  /** The newest page (`newer` false), or only what came after the last message shown. */
  const load = useCallback(async (newer: boolean) => {
    const { room: r, items: have } = latest.current;
    const after = newer && have.length ? have[have.length - 1].id : undefined;
    try {
      const page = await fetchMessages(r, { after });
      if (latest.current.room !== r) return;
      setError(null);
      setChecked(new Date());
      let next = have;
      if (after != null && !page.reset) {
        if (page.items.length) {
          next = [...have, ...page.items.filter((m) => !have.some((h) => h.id === m.id))];
          setItems(next);
        }
      } else {
        next = page.items;
        setItems(next);
        setHasOlder(page.hasOlder);
      }
      latest.current = { room: r, items: next };
      if (next.length) markSeen(r, next[next.length - 1].id);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshRooms = useCallback(() => {
    fetchRooms()
      .then((list) => {
        setRooms(list);
        applyRooms(list);
      })
      .catch(() => {});
  }, []);

  // While this screen is in front (and the app is open): fetch now, then every 30 s.
  useFocusEffect(
    useCallback(() => {
      load(latest.current.items.length > 0);
      refreshRooms();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') load(true);
      }, CHAT_POLL_MS);
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') load(true);
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [load, refreshRooms]),
  );

  const switchRoom = (r: ChatRoomId) => {
    if (r === room) return;
    latest.current = { room: r, items: [] };
    setRoom(r);
    setItems([]);
    setHasOlder(false);
    setReplyTo(null);
    setLoading(true);
    load(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    refreshRooms();
    await load(true);
    setRefreshing(false);
  };

  const older = async () => {
    if (!hasOlder || !items.length) return;
    try {
      const page = await fetchMessages(room, { before: items[0].id });
      if (latest.current.room !== room) return;
      setItems((cur) => [...page.items, ...cur]);
      setHasOlder(page.hasOlder);
    } catch (e) {
      setError(friendly(e));
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendMessage(room, body, replyTo?.id);
      setText('');
      setReplyTo(null);
      await load(true);
    } catch (e) {
      Alert.alert("Couldn't send it", friendly(e));
    } finally {
      setSending(false);
    }
  };

  const actions = (m: ChatMessage) => {
    const buttons: Parameters<typeof Alert.alert>[2] = [{ text: 'Cancel', style: 'cancel' }];
    if (account.user) buttons.push({ text: 'Reply', onPress: () => setReplyTo(m) });
    if (m.own) {
      buttons.push({
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          deleteMessage(m.id)
            .then(() => setItems((cur) => cur.filter((c) => c.id !== m.id)))
            .catch((e) => Alert.alert("Couldn't delete it", friendly(e))),
      });
    }
    if (buttons.length > 1) Alert.alert(m.own ? 'Your message' : m.author, m.body.slice(0, 200), buttons);
  };

  const info = rooms.find((r) => r.id === room) ?? DEFAULT_ROOMS[0];
  // Newest at the bottom: the list is drawn upside down so it opens there.
  const shown = [...items].reverse();

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: t.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </Pressable>
        <Text style={[styles.barTitle, { color: t.text }]}>Chat</Text>
        <Pressable hitSlop={12} onPress={refresh} disabled={refreshing} accessibilityLabel="Check for new messages">
          {refreshing ? <ActivityIndicator color={t.accent} /> : <Ionicons name="refresh" size={24} color={t.text} />}
        </Pressable>
      </View>

      <ChipRow>
        {rooms.map((r) => {
          const on = r.id === room;
          return (
            <Pressable
              key={r.id}
              onPress={() => switchRoom(r.id)}
              style={[styles.room, { backgroundColor: on ? t.accent : t.card }]}
              accessibilityState={{ selected: on }}
            >
              <Text style={{ color: on ? '#fff' : t.sub, fontSize: 13, fontWeight: on ? '600' : '400' }}>{r.name}</Text>
              {unread.has(r.id) && !on ? <View style={[styles.dot, { backgroundColor: t.danger }]} /> : null}
            </Pressable>
          );
        })}
      </ChipRow>
      <Text style={[styles.about, { color: t.sub }]}>
        {info.description}
        {checked ? `  ·  checked ${checked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
      </Text>

      {loading && !items.length ? (
        <ActivityIndicator color={t.accent} style={styles.flex} />
      ) : (
        <FlatList
          inverted
          style={styles.flex}
          data={shown}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.list}
          onEndReached={older}
          onEndReachedThreshold={0.3}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={[styles.empty, { color: t.sub }]}>{error ? error : 'No messages yet. Say hello!'}</Text>
          }
          renderItem={({ item: m }) => (
            <Pressable
              onLongPress={() => actions(m)}
              delayLongPress={300}
              style={[
                styles.msg,
                m.own ? styles.own : null,
                { backgroundColor: m.own ? t.accent + '33' : t.card },
              ]}
            >
              <Text style={[styles.meta, { color: t.sub }]}>
                <Text style={{ color: t.text, fontWeight: '600' }}>{m.own ? 'You' : m.author}</Text> · {time(m.createdAt)}
              </Text>
              {m.replyTo ? (
                <Text numberOfLines={2} style={[styles.quote, { color: t.sub, borderLeftColor: t.accent }]}>
                  <Text style={{ fontWeight: '600' }}>{m.replyTo.author}</Text>: {m.replyTo.body}
                </Text>
              ) : null}
              <Text style={{ color: t.text, fontSize: 15 }}>{m.body}</Text>
            </Pressable>
          )}
        />
      )}
      {error && items.length ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}

      <View style={[styles.composer, { borderTopColor: t.border, paddingBottom: insets.bottom + 8 }]}>
        {account.user ? (
          <>
            {replyTo ? (
              <View style={[styles.replying, { borderLeftColor: t.accent }]}>
                <Text numberOfLines={1} style={{ color: t.sub, flex: 1, fontSize: 13 }}>
                  Replying to <Text style={{ fontWeight: '600' }}>{replyTo.own ? 'yourself' : replyTo.author}</Text>: {replyTo.body}
                </Text>
                <Pressable hitSlop={10} onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply">
                  <Ionicons name="close" size={18} color={t.sub} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.row}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder={`Message ${info.name}`}
                placeholderTextColor={t.sub}
                maxLength={CHAT_MAX}
                multiline
                style={[styles.input, { backgroundColor: t.card, color: t.text }]}
              />
              <Pressable
                onPress={send}
                disabled={sending || !text.trim()}
                style={[styles.send, { backgroundColor: t.accent, opacity: sending || !text.trim() ? 0.5 : 1 }]}
                accessibilityLabel="Send"
              >
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
              </Pressable>
            </View>
            <Text style={[styles.hint, { color: t.sub }]}>Long-press a message to reply or delete your own. Be kind.</Text>
          </>
        ) : account.enabled ? (
          <Pressable onPress={() => router.push('/account')} style={[styles.signIn, { backgroundColor: t.accent }]}>
            <Ionicons name="log-in-outline" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '600' }}>Sign in to chat</Text>
          </Pressable>
        ) : (
          <Text style={[styles.hint, { color: t.sub }]}>Reading only: accounts are turned off in this build.</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  barTitle: { fontSize: 17, fontWeight: '700' },
  room: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 18 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  about: { fontSize: 12, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 4 },
  list: { padding: 12, gap: 8 },
  empty: { textAlign: 'center', padding: 24, transform: [{ scaleY: -1 }] },
  msg: { maxWidth: '85%', alignSelf: 'flex-start', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  own: { alignSelf: 'flex-end' },
  meta: { fontSize: 11 },
  quote: { fontSize: 12, borderLeftWidth: 3, paddingLeft: 8, marginVertical: 2 },
  error: { fontSize: 12, paddingHorizontal: 14, paddingVertical: 4 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  replying: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, paddingLeft: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderRadius: 21, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11, textAlign: 'center' },
  signIn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 12 },
});
