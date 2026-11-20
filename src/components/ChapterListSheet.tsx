import { Ionicons } from '@expo/vector-icons';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../lib/theme';
import type { Chapter } from '../lib/types';

const ROW_HEIGHT = 52;

type Props = {
  visible: boolean;
  onClose: () => void;
  chapters: Chapter[];
  currentId?: string;
  /** Marks chapters saved on the phone. */
  isDownloaded?: (id: string) => boolean;
  onPick: (c: Chapter) => void;
};

/** Novel reader sheet: every chapter, opened at the one being read; tap one to go there. */
export function ChapterListSheet({ visible, onClose, chapters, currentId, isDownloaded, onPick }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const current = chapters.findIndex((c) => c.id === currentId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom }]}>
        <Text style={[styles.title, { color: t.text }]}>
          Chapters{current >= 0 ? ` · ${current + 1} of ${chapters.length}` : ''}
        </Text>
        <FlatList
          data={chapters}
          keyExtractor={(c) => c.id}
          // Opens with the current chapter near the top, a couple of rows of context above it.
          initialScrollIndex={Math.max(current - 2, 0)}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          renderItem={({ item, index }) => {
            const on = item.id === currentId;
            return (
              <Pressable
                style={[styles.row, { borderBottomColor: t.border }, on && { backgroundColor: t.card }]}
                onPress={() => {
                  onClose();
                  if (!on) onPick(item);
                }}
              >
                <Text style={[styles.num, { color: t.sub }]}>{index + 1}</Text>
                <Text numberOfLines={1} style={[styles.name, { color: on ? t.accent : t.text }, on && styles.bold]}>
                  {item.name}
                </Text>
                {isDownloaded?.(item.id) ? <Ionicons name="checkmark-done-circle" size={18} color={t.accent} /> : null}
                {on ? <Ionicons name="book" size={16} color={t.accent} /> : null}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: '70%', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  title: { fontSize: 16, fontWeight: '700', padding: 16 },
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  num: { width: 40, fontSize: 12 },
  name: { flex: 1, fontSize: 15 },
  bold: { fontWeight: '700' },
});
