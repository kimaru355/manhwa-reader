import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '../lib/account';
import { friendly } from '../lib/errors';
import { TIER_LABEL, TIER_ORDER } from '../lib/recs';
import type { Series, Tier } from '../lib/types';

const ACCENT = '#B76CF0';

/** Lets a signed-in user recommend a title with a tier and a short note. */
export function RecommendSheet({ series, visible, onClose }: { series: Series; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior="padding">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.title}>Recommend “{series.title}”</Text>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: '#1A1A1F', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 12 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#26262C' },
  input: { backgroundColor: '#26262C', color: '#fff', borderRadius: 10, padding: 12, minHeight: 80, fontSize: 15, textAlignVertical: 'top' },
  save: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 13 },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
