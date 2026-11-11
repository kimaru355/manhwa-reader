import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Bookmark, Chapter } from '../lib/types';

const ACCENT = '#B76CF0';

type Props = {
  visible: boolean;
  onClose: () => void;
  chapters: Chapter[];
  /** Where the reader is right now. */
  current: { chapter: Chapter; page: number };
  bookmarks: Bookmark[];
  /** Bookmarks from the author's recommendation; read-only. */
  author?: Bookmark[];
  /** Approved bookmarks suggested by other readers; read-only. */
  community?: Bookmark[];
  /** Suggest one of your bookmarks to everyone (an admin reviews it first). */
  onShare?: (b: Bookmark) => void;
  onAdd: (note: string) => void;
  onOpen: (b: Bookmark) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, note: string) => void;
};

/** Reader sheet: bookmark the current spot with an optional note, and jump to saved ones. */
export function BookmarksSheet({ visible, onClose, chapters, current, bookmarks, author = [], community = [], onShare, onAdd, onOpen, onRemove, onEdit }: Props) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<Bookmark | null>(null);

  const order = (b: Bookmark) => {
    const i = chapters.findIndex((c) => c.id === b.chapterId);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sorted = [...bookmarks].sort((a, b) => order(a) - order(b) || a.page - b.page);

  const save = () => {
    if (editing) onEdit(editing.id, note);
    else onAdd(note);
    setEditing(null);
    setNote('');
  };

  const startEdit = (b: Bookmark) => {
    setEditing(b);
    setNote(b.note);
  };

  const cancelEdit = () => {
    setEditing(null);
    setNote('');
  };

  const close = () => {
    cancelEdit();
    onClose();
  };

  const confirmRemove = (b: Bookmark) =>
    Alert.alert('Remove bookmark?', `${b.chapterName} · p.${b.page}${b.note ? `\n"${b.note}"` : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (editing?.id === b.id) cancelEdit();
          onRemove(b.id);
        },
      },
    ]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior="padding">
        <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <FlatList
            data={sorted}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(b) => b.id}
            ListHeaderComponent={
              <View>
                <Text style={styles.title}>{editing ? 'Edit bookmark' : 'Bookmark this chapter'}</Text>
                <View style={styles.form}>
                  <Text numberOfLines={1} style={styles.where}>
                    {editing
                      ? `${editing.chapterName} · p.${editing.page}`
                      : `${current.chapter.name} · p.${current.page}`}
                  </Text>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Add a note (optional), e.g. peak fight"
                    placeholderTextColor="#777"
                    style={styles.input}
                    maxLength={200}
                    returnKeyType="done"
                    onSubmitEditing={save}
                  />
                  <Pressable style={styles.save} onPress={save}>
                    <Ionicons name={editing ? 'checkmark' : 'bookmark'} size={16} color="#fff" />
                    <Text style={styles.saveText}>{editing ? 'Save changes' : 'Bookmark'}</Text>
                  </Pressable>
                  {editing ? (
                    <Pressable style={styles.cancel} onPress={cancelEdit}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </Pressable>
                  ) : null}
                </View>
                {author.length ? (
                  <View>
                    <Text style={[styles.title, { paddingTop: 8 }]}>Author’s bookmarks</Text>
                    {author.map((b) => (
                      <Pressable key={b.id} style={styles.row} onPress={() => onOpen(b)}>
                        <Ionicons name="sparkles" size={18} color={ACCENT} />
                        <View style={styles.rowText}>
                          <Text numberOfLines={1} style={styles.rowTitle}>
                            {b.chapterName} · p.{b.page}
                          </Text>
                          {b.note ? (
                            <Text numberOfLines={2} style={styles.rowNote}>
                              {b.note}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {community.length ? (
                  <View>
                    <Text style={[styles.title, { paddingTop: 8 }]}>Community bookmarks</Text>
                    {community.map((b) => (
                      <Pressable key={b.id} style={styles.row} onPress={() => onOpen(b)}>
                        <Ionicons name="people" size={18} color={ACCENT} />
                        <View style={styles.rowText}>
                          <Text numberOfLines={1} style={styles.rowTitle}>
                            {b.chapterName} · p.{b.page}
                          </Text>
                          {b.note ? (
                            <Text numberOfLines={2} style={styles.rowNote}>
                              {b.note}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <Text style={[styles.title, { paddingTop: 8 }]}>
                  Saved{sorted.length ? ` (${sorted.length})` : ''}
                </Text>
              </View>
            }
            ListEmptyComponent={<Text style={styles.empty}>No bookmarks of your own yet.</Text>}
            renderItem={({ item }) => {
              const exists = order(item) !== Number.MAX_SAFE_INTEGER;
              return (
                <Pressable style={[styles.row, !exists && { opacity: 0.45 }]} disabled={!exists} onPress={() => onOpen(item)}>
                  <Ionicons name="bookmark" size={18} color={ACCENT} />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1} style={styles.rowTitle}>
                      {item.chapterName} · p.{item.page}
                    </Text>
                    {item.note ? (
                      <Text numberOfLines={2} style={styles.rowNote}>
                        {item.note}
                      </Text>
                    ) : null}
                  </View>
                  {onShare ? (
                    <Pressable hitSlop={10} onPress={() => onShare(item)}>
                      <Ionicons name="share-social-outline" size={20} color="#9A9AA4" />
                    </Pressable>
                  ) : null}
                  <Pressable hitSlop={10} onPress={() => startEdit(item)}>
                    <Ionicons
                      name="create-outline"
                      size={20}
                      color={editing?.id === item.id ? ACCENT : '#9A9AA4'}
                    />
                  </Pressable>
                  <Pressable hitSlop={10} onPress={() => confirmRemove(item)}>
                    <Ionicons name="trash-outline" size={20} color="#9A9AA4" />
                  </Pressable>
                </Pressable>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: 560, backgroundColor: '#1A1A1F', borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', padding: 16, paddingBottom: 8 },
  form: { paddingHorizontal: 16, gap: 10 },
  where: { color: '#9A9AA4', fontSize: 13 },
  input: {
    backgroundColor: '#26262C',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
  },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 12,
  },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  cancel: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { color: '#9A9AA4', fontSize: 14 },
  empty: { color: '#9A9AA4', paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: '#E6E6EA', fontSize: 15 },
  rowNote: { color: ACCENT, fontSize: 13 },
});
