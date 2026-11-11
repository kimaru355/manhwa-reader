import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount, type UserRecommendation } from '../lib/account';
import { mySuggestions, withdrawSuggestion, type Suggestion } from '../lib/community';
import { friendly } from '../lib/errors';
import { TIER_LABEL } from '../lib/recs';
import { useTheme } from '../lib/theme';

export default function Account() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const acc = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [recs, setRecs] = useState<UserRecommendation[] | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  const loadRecs = useCallback(() => {
    acc
      .myRecommendations()
      .then(setRecs)
      .catch(() => setRecs(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acc.myRecommendations]);

  const loadSuggestions = useCallback(() => {
    mySuggestions()
      .then(setSuggestions)
      .catch(() => setSuggestions(null));
  }, []);

  useEffect(() => {
    if (acc.user) {
      loadRecs();
      loadSuggestions();
    }
  }, [acc.user, loadRecs, loadSuggestions]);

  const submit = async (mode: 'in' | 'up') => {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email and a password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') await acc.signIn(email, password);
      else {
        const { needsConfirmation } = await acc.signUp(email, password);
        if (needsConfirmation) {
          Alert.alert('Check your email', 'We sent you a link to confirm your account. Then come back and sign in.');
        }
      }
      setPassword('');
    } catch (e) {
      Alert.alert(mode === 'in' ? "Couldn't sign in" : "Couldn't create the account", friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Type your email above, then tap Forgot password.');
      return;
    }
    try {
      await acc.forgotPassword(email.trim());
      Alert.alert('Check your email', 'If an account exists for that address, we sent a link to reset the password.');
    } catch (e) {
      Alert.alert("Couldn't send the email", friendly(e));
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account, synced bookmarks and favorites, and your recommendations. What is on this phone stays.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => acc.deleteAccount().catch((e) => Alert.alert("Couldn't delete the account", friendly(e))),
        },
      ],
    );

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Your bookmarks and favorites stay on this phone and in your account.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => acc.signOut() },
    ]);

  const removeRec = (r: UserRecommendation) =>
    Alert.alert(`Remove "${r.title}"?`, 'It will no longer appear in your recommendations.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          acc
            .removeRecommendation(r.id)
            .then(loadRecs)
            .catch((e) => Alert.alert("Couldn't remove it", friendly(e))),
      },
    ]);

  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </Pressable>
        <Text style={[styles.barTitle, { color: t.text }]}>Account</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {!acc.enabled ? (
          <Text style={[styles.hint, { color: t.sub }]}>
            Accounts aren’t available in this version of the app yet. Everything else works without one.
          </Text>
        ) : acc.user ? (
          <>
            <View style={[styles.card, { backgroundColor: t.card }]}>
              <Ionicons name="person-circle-outline" size={34} color={t.accent} />
              <View style={styles.flex}>
                <Text numberOfLines={1} style={[styles.email, { color: t.text }]}>
                  {acc.user.email}
                </Text>
                <Text style={{ color: acc.syncError ? t.danger : t.sub, fontSize: 12 }}>
                  {acc.syncError ??
                    (acc.syncing ? 'Syncing…' : acc.lastSync ? `Synced ${new Date(acc.lastSync).toLocaleTimeString()}` : 'Not synced yet')}
                </Text>
              </View>
              {acc.syncing ? <ActivityIndicator color={t.accent} /> : null}
            </View>

            <Text style={[styles.hint, { color: t.sub }]}>
              Your bookmarks, favorites and wishlist are saved to your account and shared across your devices.
            </Text>

            <View style={styles.pair}>
              <Pressable onPress={() => acc.syncNow()} style={[styles.secondary, styles.flex, { borderColor: t.border }]}>
                <Ionicons name="sync" size={18} color={t.text} />
                <Text style={{ color: t.text }}>Sync now</Text>
              </Pressable>
              <Pressable onPress={confirmSignOut} style={[styles.secondary, styles.flex, { borderColor: t.border }]}>
                <Ionicons name="log-out-outline" size={18} color={t.danger} />
                <Text style={{ color: t.danger }}>Sign out</Text>
              </Pressable>
            </View>

            <Text style={[styles.section, { color: t.sub }]}>YOUR RECOMMENDATIONS</Text>
            {recs === null ? (
              <Text style={[styles.hint, { color: t.sub }]}>Couldn’t load them right now.</Text>
            ) : recs.length === 0 ? (
              <Text style={[styles.hint, { color: t.sub }]}>
                None yet. Open a title and tap Recommend to share it.
              </Text>
            ) : (
              recs.map((r) => (
                <View key={r.id} style={[styles.card, { backgroundColor: t.card }]}>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={[styles.email, { color: t.text }]}>
                      {r.title}
                    </Text>
                    <Text numberOfLines={2} style={{ color: t.sub, fontSize: 12 }}>
                      {TIER_LABEL[r.tier]}
                      {r.note ? ` · ${r.note}` : ''}
                    </Text>
                  </View>
                  <Pressable hitSlop={10} onPress={() => removeRec(r)}>
                    <Ionicons name="trash-outline" size={20} color={t.sub} />
                  </Pressable>
                </View>
              ))
            )}

            <Text style={[styles.section, { color: t.sub }]}>YOUR BOOKMARK SUGGESTIONS</Text>
            {suggestions === null ? (
              <Text style={[styles.hint, { color: t.sub }]}>Couldn’t load them right now.</Text>
            ) : suggestions.length === 0 ? (
              <Text style={[styles.hint, { color: t.sub }]}>
                None yet. In the reader, open the bookmark list and tap the share icon on one of your bookmarks.
              </Text>
            ) : (
              suggestions.map((s) => (
                <View key={s.id} style={[styles.card, { backgroundColor: t.card }]}>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={[styles.email, { color: t.text }]}>
                      {s.seriesTitle}
                    </Text>
                    <Text numberOfLines={2} style={{ color: t.sub, fontSize: 12 }}>
                      {s.chapterName} · p.{s.page}
                      {s.note ? ` · ${s.note}` : ''}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: s.status === 'approved' ? t.accent : s.status === 'rejected' ? t.danger : t.sub,
                      }}
                    >
                      {s.status === 'pending' ? 'Waiting for review' : s.status === 'approved' ? 'Approved' : 'Not accepted'}
                      {s.status === 'rejected' && s.rejectReason ? `: ${s.rejectReason}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    hitSlop={10}
                    onPress={() =>
                      Alert.alert('Withdraw this suggestion?', s.status === 'approved' ? 'It will no longer be shown to others.' : undefined, [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Withdraw',
                          style: 'destructive',
                          onPress: () =>
                            withdrawSuggestion(s.id)
                              .then(loadSuggestions)
                              .catch((e) => Alert.alert("Couldn't withdraw it", friendly(e))),
                        },
                      ])
                    }
                  >
                    <Ionicons name="trash-outline" size={20} color={t.sub} />
                  </Pressable>
                </View>
              ))
            )}

            <Pressable onPress={confirmDelete} style={{ alignSelf: 'center', marginTop: 24 }}>
              <Text style={{ color: t.danger, fontSize: 14 }}>Delete my account</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[styles.hint, { color: t.sub }]}>
              An account is optional. You can read and download without one. Signing in saves your bookmarks and
              favorites online and lets you share recommendations.
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={t.sub}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[styles.input, { backgroundColor: t.card, color: t.text }]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password (8+ characters)"
              placeholderTextColor={t.sub}
              secureTextEntry
              autoCapitalize="none"
              style={[styles.input, { backgroundColor: t.card, color: t.text }]}
              onSubmitEditing={() => submit('in')}
            />
            <Pressable disabled={busy} onPress={() => submit('in')} style={[styles.primary, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign in</Text>}
            </Pressable>
            <Pressable onPress={forgot} hitSlop={8} style={{ alignSelf: 'center' }}>
              <Text style={{ color: t.accent, fontSize: 14 }}>Forgot password?</Text>
            </Pressable>
            <Pressable disabled={busy} onPress={() => submit('up')} style={[styles.secondary, { borderColor: t.border, opacity: busy ? 0.6 : 1 }]}>
              <Text style={{ color: t.text, fontSize: 15 }}>Create account</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  barTitle: { fontSize: 18, fontWeight: '700' },
  wrap: { padding: 16, gap: 10 },
  hint: { fontSize: 13, lineHeight: 18 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 14 },
  input: { height: 46, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  email: { fontSize: 15, fontWeight: '600' },
  pair: { flexDirection: 'row', gap: 10 },
  primary: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
  },
});
