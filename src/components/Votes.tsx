import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '../lib/account';
import { friendly } from '../lib/errors';
import { toggleReaction, useCounts, useLoadReactions, type ReactionType } from '../lib/reactions';
import { useTheme } from '../lib/theme';

/** Colors for the always-dark reader screens. */
const DARK = { text: '#E6E6EA', sub: '#9A9AA4', accent: '#B76CF0', card: '#26262C', border: '#33333A', danger: '#F06A6A' };

/**
 * Like / dislike with counts for a comment, recommendation or chapter bookmark. Counts load on their own (in a
 * batch with the other buttons) unless the list already provided them (`load={false}`).
 */
export function Votes({ type, id, load = true, dark }: { type: ReactionType; id: string; load?: boolean; dark?: boolean }) {
  const theme = useTheme();
  const t = dark ? DARK : theme;
  const account = useAccount();
  useLoadReactions(load ? [{ type, id }] : []);
  const c = useCounts({ type, id });
  const [busy, setBusy] = useState(false);

  const press = async (value: 1 | -1) => {
    if (!account.user) {
      Alert.alert('Sign in to like or dislike', 'An account is only needed for this, not for reading.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Sign in', onPress: () => router.push('/account') },
      ]);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await toggleReaction({ type, id }, value, true);
    } catch (e) {
      Alert.alert("Couldn't save that", friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const liked = c?.mine === 1;
  const disliked = c?.mine === -1;
  return (
    <View style={styles.row}>
      <Pressable
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Like"
        accessibilityState={{ selected: liked }}
        onPress={() => press(1)}
        style={[styles.btn, { borderColor: liked ? t.accent : t.border, backgroundColor: liked ? t.accent : t.card }]}
      >
        <Ionicons name={liked ? 'thumbs-up' : 'thumbs-up-outline'} size={14} color={liked ? '#fff' : t.text} />
        <Text style={[styles.n, { color: liked ? '#fff' : t.text }]}>{c ? c.likes : ''}</Text>
      </Pressable>
      <Pressable
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Dislike"
        accessibilityState={{ selected: disliked }}
        onPress={() => press(-1)}
        style={[styles.btn, { borderColor: disliked ? t.danger : t.border, backgroundColor: t.card }]}
      >
        <Ionicons name={disliked ? 'thumbs-down' : 'thumbs-down-outline'} size={14} color={disliked ? t.danger : t.text} />
        <Text style={[styles.n, { color: disliked ? t.danger : t.text }]}>{c ? c.dislikes : ''}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4 },
  n: { fontSize: 12, minWidth: 6 },
});
