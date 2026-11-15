import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAccount } from '../lib/account';
import * as api from '../lib/api';
import { friendly } from '../lib/errors';
import { seedReactions } from '../lib/reactions';
import { useTheme } from '../lib/theme';
import { Votes } from './Votes';

type Comment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  likes: number;
  dislikes: number;
  mine: -1 | 0 | 1;
  own: boolean;
};
type Page = { total: number; items: Comment[]; nextCursor: number | null };

const MAX = 1000;
const DARK = { bg: '#0B0B0D', text: '#E6E6EA', sub: '#9A9AA4', accent: '#B76CF0', card: '#1A1A1F', border: '#2A2A30', danger: '#F06A6A' };

function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 2592000) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Comments on a title (no chapterId) or on one chapter, with likes and dislikes. Reading them needs no account;
 * posting, liking and disliking do. `dark` is for the reader.
 */
export function Comments({
  source,
  seriesId,
  chapterId,
  title = 'Comments',
  dark,
}: {
  source: string;
  seriesId: string;
  chapterId?: string;
  title?: string;
  dark?: boolean;
}) {
  const theme = useTheme();
  const t = dark ? DARK : theme;
  const account = useAccount();
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [items, setItems] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const run = useRef(0);

  const load = useCallback(
    async (from: number) => {
      const mine = ++run.current;
      setLoading(true);
      setError(null);
      try {
        const q = [`source=${encodeURIComponent(source)}`, `seriesId=${encodeURIComponent(seriesId)}`, `sort=${sort}`, `cursor=${from}`];
        if (chapterId) q.push(`chapterId=${encodeURIComponent(chapterId)}`);
        const res = await api.publicGet<Page>(`/comments?${q.join('&')}`);
        if (mine !== run.current) return;
        seedReactions(res.items.map((c) => ({ type: 'comment' as const, id: c.id, likes: c.likes, dislikes: c.dislikes, mine: c.mine })));
        setItems((prev) => (from === 0 ? res.items : [...prev, ...res.items.filter((c) => !prev.some((x) => x.id === c.id))]));
        setTotal(res.total);
        setCursor(res.nextCursor);
      } catch (e) {
        if (mine === run.current) setError(friendly(e));
      } finally {
        if (mine === run.current) setLoading(false);
      }
    },
    [source, seriesId, chapterId, sort],
  );

  // Reloads for another title/chapter or sort, and after signing in or out.
  useEffect(() => {
    // Loading is the point of this effect (it sets the list once the request returns).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(0);
  }, [load, account.user?.id]);

  const post = async () => {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const c = await api.authed<Comment>('/comments', { method: 'POST', body: { source, seriesId, chapterId: chapterId ?? null, body } });
      seedReactions([{ type: 'comment', id: c.id, likes: 0, dislikes: 0, mine: 0 }]);
      setItems((prev) => [c, ...prev]);
      setTotal((n) => n + 1);
      setText('');
    } catch (e) {
      Alert.alert("Couldn't post your comment", friendly(e));
    } finally {
      setPosting(false);
    }
  };

  const remove = (c: Comment) =>
    Alert.alert('Delete your comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.authed(`/comments/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
            setItems((prev) => prev.filter((x) => x.id !== c.id));
            setTotal((n) => Math.max(0, n - 1));
          } catch (e) {
            Alert.alert("Couldn't delete it", friendly(e));
          }
        },
      },
    ]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: t.text }]}>
          {title}
          {total ? <Text style={{ color: t.sub, fontWeight: '400' }}> ({total})</Text> : null}
        </Text>
        <View style={styles.sorts}>
          {(['top', 'new'] as const).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSort(s)}
              style={[styles.chip, { borderColor: sort === s ? t.accent : t.border, backgroundColor: sort === s ? t.accent : 'transparent' }]}
            >
              <Text style={{ color: sort === s ? '#fff' : t.sub, fontSize: 12 }}>{s === 'top' ? 'Top' : 'Newest'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {account.user ? (
        <View style={[styles.form, { borderColor: t.border, backgroundColor: t.card }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            maxLength={MAX}
            placeholder={chapterId ? 'What did you think of this chapter? Mark spoilers.' : 'What do you think of this title? Mark spoilers.'}
            placeholderTextColor={t.sub}
            style={[styles.input, { color: t.text }]}
          />
          <View style={styles.formBar}>
            <Text style={{ color: t.sub, fontSize: 11 }}>
              {text.length}/{MAX}
            </Text>
            <Pressable
              disabled={posting || !text.trim()}
              onPress={post}
              style={[styles.post, { backgroundColor: t.accent, opacity: posting || !text.trim() ? 0.5 : 1 }]}
            >
              <Text style={styles.postText}>{posting ? 'Posting…' : 'Post'}</Text>
            </Pressable>
          </View>
        </View>
      ) : account.enabled ? (
        <Pressable onPress={() => router.push('/account')}>
          <Text style={{ color: t.sub, marginBottom: 8 }}>
            <Text style={{ color: t.accent }}>Sign in</Text> to comment, like and dislike. Reading doesn’t need an account.
          </Text>
        </Pressable>
      ) : null}

      {items.map((c) => (
        <View key={c.id} style={[styles.item, { borderTopColor: t.border }]}>
          <View style={styles.itemHead}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 13 }}>{c.own ? 'You' : c.author}</Text>
            <Text style={{ color: t.sub, fontSize: 12 }}>{ago(c.createdAt)}</Text>
          </View>
          <Text style={{ color: t.text, lineHeight: 20, marginVertical: 4 }}>{c.body}</Text>
          {c.own ? (
            <Pressable hitSlop={8} onPress={() => remove(c)}>
              <Text style={{ color: t.sub, fontSize: 12 }}>Delete</Text>
            </Pressable>
          ) : (
            <Votes type="comment" id={c.id} load={false} dark={dark} />
          )}
        </View>
      ))}

      {error ? (
        <Pressable onPress={() => load(0)}>
          <Text style={{ color: t.danger, marginVertical: 8 }}>{error} Tap to try again.</Text>
        </Pressable>
      ) : null}
      {loading ? <ActivityIndicator color={t.accent} style={{ marginVertical: 12 }} /> : null}
      {!loading && !error && !items.length ? <Text style={{ color: t.sub, marginVertical: 8 }}>No comments yet. Be the first.</Text> : null}
      {!loading && cursor !== null ? (
        <Pressable onPress={() => load(cursor)} style={[styles.more, { borderColor: t.border }]}>
          <Text style={{ color: t.text }}>More comments</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700' },
  sorts: { flexDirection: 'row', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  form: { borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 10 },
  input: { minHeight: 60, maxHeight: 160, textAlignVertical: 'top', fontSize: 15 },
  formBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  post: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  postText: { color: '#fff', fontWeight: '600' },
  item: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  itemHead: { flexDirection: 'row', gap: 8, alignItems: 'baseline' },
  more: { alignItems: 'center', paddingVertical: 10, borderWidth: 1, borderRadius: 10, marginTop: 8 },
});
