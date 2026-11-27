import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '../lib/account';
import { publicPost } from '../lib/api';
import { friendly } from '../lib/errors';
import { useTheme } from '../lib/theme';

const KINDS = [
  { value: 'feature', label: '💡 Request a feature', hint: 'What would you like the app to do?' },
  { value: 'bug', label: '🐞 Report a bug', hint: 'What went wrong? What did you do just before, and what did you expect?' },
  { value: 'feedback', label: '💬 General feedback', hint: 'What do you like, or what could be better?' },
  { value: 'other', label: '✉️ Something else', hint: 'What would you like to tell us?' },
] as const;
type Kind = (typeof KINDS)[number]['value'];

const MAX = 2000;

/** Feature requests, bug reports and other feedback, sent to the admin (the same as the website's Feedback page). */
export default function Feedback() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const [kind, setKind] = useState<Kind>('feature');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [where, setWhere] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hint = KINDS.find((k) => k.value === kind)!.hint;

  const send = async () => {
    if (message.trim().length < 10) return setError('Write at least a sentence (10 characters or more).');
    setBusy(true);
    setError(null);
    const version = Constants.expoConfig?.version;
    try {
      await publicPost('/feedback', {
        kind,
        message: message.trim(),
        contact: contact.trim() || null,
        // Bug reports say where it happened, with the app version so it can be found again.
        page: kind === 'bug' ? `App ${version ?? ''} (${Platform.OS})${where.trim() ? `: ${where.trim()}` : ''}`.slice(0, 300) : null,
      });
      setSent(true);
    } catch (e) {
      setError(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const field = [styles.input, { backgroundColor: t.card, color: t.text }];

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: t.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </Pressable>
        <Text style={[styles.barTitle, { color: t.text }]}>Feedback</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {sent ? (
          <View style={[styles.card, { backgroundColor: t.card }]}>
            <Ionicons name="checkmark-circle" size={36} color={t.accent} />
            <Text style={[styles.title, { color: t.text }]}>Thank you!</Text>
            <Text style={{ color: t.sub, textAlign: 'center' }}>
              Your message was sent. {contact.trim() ? "If we need more details, we'll get in touch." : ''}
            </Text>
            <Pressable
              onPress={() => {
                setSent(false);
                setMessage('');
                setWhere('');
              }}
              style={[styles.button, { backgroundColor: t.bg }]}
            >
              <Text style={{ color: t.text, fontWeight: '600' }}>Send another</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={{ color: t.sub, fontSize: 14 }}>
              Missing a feature, found a bug, or have an idea? Tell us here. Every message is read.
            </Text>
            <View style={styles.kinds}>
              {KINDS.map((k) => {
                const on = k.value === kind;
                return (
                  <Pressable
                    key={k.value}
                    onPress={() => setKind(k.value)}
                    style={[styles.kind, { backgroundColor: on ? t.accent : t.card }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={{ color: on ? '#fff' : t.text, fontSize: 13, fontWeight: on ? '600' : '400' }}>{k.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.label, { color: t.text }]}>Your message</Text>
            <TextInput
              value={message}
              onChangeText={(v) => {
                setMessage(v);
                setError(null);
              }}
              placeholder={hint}
              placeholderTextColor={t.sub}
              multiline
              maxLength={MAX}
              textAlignVertical="top"
              style={[field, styles.message]}
            />
            <Text style={[styles.count, { color: t.sub }]}>
              {message.length}/{MAX}
            </Text>
            {kind === 'bug' ? (
              <>
                <Text style={[styles.label, { color: t.text }]}>Where did it happen? (optional)</Text>
                <TextInput
                  value={where}
                  onChangeText={setWhere}
                  placeholder="e.g. the reader, Downloads, a title's page"
                  placeholderTextColor={t.sub}
                  maxLength={200}
                  style={field}
                />
              </>
            ) : null}
            <Text style={[styles.label, { color: t.text }]}>How can we reach you? (optional)</Text>
            <TextInput
              value={contact}
              onChangeText={setContact}
              placeholder="Email or username, only if you'd like a reply"
              placeholderTextColor={t.sub}
              maxLength={200}
              autoCapitalize="none"
              keyboardType="email-address"
              style={field}
            />
            <Text style={{ color: t.sub, fontSize: 12 }}>
              {account.user ? 'Sent with your account, so we know who it came from.' : 'You can send this without an account.'} Only
              the admin reads these messages.
            </Text>
            {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
            <Pressable onPress={send} disabled={busy} style={[styles.button, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={16} color="#fff" />}
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{busy ? 'Sending…' : 'Send'}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  barTitle: { fontSize: 17, fontWeight: '700' },
  wrap: { padding: 16, gap: 10 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 18 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  message: { minHeight: 140 },
  count: { fontSize: 11, textAlign: 'right' },
  card: { borderRadius: 14, padding: 20, gap: 10, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  button: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, marginTop: 6 },
});
