import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nextBlock, parseRange, sliceRange } from '../lib/chapterRange';
import { useTheme } from '../lib/theme';
import type { Chapter } from '../lib/types';

export type RangeMode = 'download' | 'delete';

type Props = {
  mode: RangeMode | null;
  onClose: () => void;
  /** Oldest first; ranges count positions in this list. */
  chapters: Chapter[];
  /** 0-based position of the chapter being read, or -1. */
  current: number;
  /** For a range: how many chapters it would add to Downloads, or delete. */
  count: (list: Chapter[]) => number;
  onConfirm: (mode: RangeMode, list: Chapter[]) => void;
};

/** Pick chapters by number ("1" to "100") to download or delete. */
export function ChapterRangeSheet({ mode, onClose, chapters, current, count, onConfirm }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const total = chapters.length;

  const close = () => {
    setFrom('');
    setTo('');
    onClose();
  };

  const fill = (r: { start: number; end: number }) => {
    setFrom(String(r.start));
    setTo(String(r.end));
  };

  const typed = from.trim() || to.trim();
  const range = typed ? parseRange(from, to, total) : null;
  const list = range?.ok ? sliceRange(chapters, range) : [];
  const n = list.length ? count(list) : 0;
  const deleting = mode === 'delete';

  // Shortcuts: the next chapters from where you are, or the chapters you have already read.
  const at = current >= 0 ? current + 1 : 1;
  const shortcuts = deleting
    ? current > 0
      ? [{ label: `Already read (1–${current})`, range: { start: 1, end: current } }]
      : []
    : [50, 100].map((size) => {
        const r = nextBlock(at, size, total);
        return { label: `${current >= 0 ? 'Next' : 'First'} ${size} (${r.start}–${r.end})`, range: r };
      });

  const summary = !range
    ? `Type chapter numbers between 1 and ${total}.`
    : !range.ok
      ? range.message
      : `${range.start === range.end ? `Chapter ${range.start}` : `Chapters ${range.start}–${range.end}`}: “${list[0].name}”${
          list.length > 1 ? ` to “${list[list.length - 1].name}”` : ''
        }`;

  const action = deleting
    ? n
      ? `Delete ${n} chapter${n === 1 ? '' : 's'}`
      : 'None of these are downloaded or waiting'
    : n
      ? `Download ${n} chapter${n === 1 ? '' : 's'}`
      : 'All of these are downloaded or waiting';

  const input = [styles.input, { backgroundColor: t.card, color: t.text, borderColor: t.border }];

  return (
    <Modal visible={!!mode} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior="padding">
        <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 16 }]}>
          <Text style={[styles.title, { color: t.text }]}>{deleting ? 'Delete downloaded chapters' : 'Download chapters'}</Text>
          <Text style={{ color: t.sub, fontSize: 13 }}>
            Chapters are numbered 1 to {total}, oldest first.
            {deleting ? ' Chapters waiting to download in this range are taken off the list too.' : ''}
          </Text>

          <View style={styles.row}>
            <TextInput
              value={from}
              onChangeText={setFrom}
              placeholder="From (1)"
              placeholderTextColor={t.sub}
              keyboardType="number-pad"
              returnKeyType="next"
              style={input}
            />
            <Text style={{ color: t.sub }}>to</Text>
            <TextInput
              value={to}
              onChangeText={setTo}
              placeholder={`To (${total})`}
              placeholderTextColor={t.sub}
              keyboardType="number-pad"
              style={input}
            />
          </View>

          {shortcuts.length ? (
            <View style={styles.shortcuts}>
              {shortcuts.map((s) => (
                <Pressable key={s.label} onPress={() => fill(s.range)} style={[styles.shortcut, { borderColor: t.border }]}>
                  <Text style={{ color: t.text, fontSize: 13 }}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text numberOfLines={3} style={{ color: range && !range.ok ? t.danger : t.sub, fontSize: 13 }}>
            {summary}
          </Text>

          <Pressable
            disabled={!n}
            onPress={() => {
              if (!mode) return;
              onConfirm(mode, list);
              close();
            }}
            style={[styles.confirm, { backgroundColor: deleting ? t.danger : t.accent, opacity: n ? 1 : 0.45 }]}
          >
            <Ionicons name={deleting ? 'trash-outline' : 'download-outline'} size={18} color="#fff" />
            <Text style={styles.confirmText}>{range?.ok ? action : deleting ? 'Delete' : 'Download'}</Text>
          </Pressable>
          <Pressable onPress={close} style={styles.cancel}>
            <Text style={{ color: t.sub }}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 16 },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shortcut: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  confirm: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingVertical: 13 },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cancel: { alignItems: 'center', paddingVertical: 4 },
});
