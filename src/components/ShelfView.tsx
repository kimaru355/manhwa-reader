import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLibrary } from '../lib/library';
import {
  categoriesOf,
  countByCategory,
  filterByCategory,
  MAX_NAME,
  NAME_PROBLEM_TEXT,
  nameProblem,
  type ListCategory,
  type Shelf,
} from '../lib/listCategories';
import { useTheme, type Theme } from '../lib/theme';
import type { Series } from '../lib/types';
import { EmptyState } from './EmptyState';
import { SeriesGrid } from './SeriesGrid';

/** Asking for a name: a new category (optionally for a title that should go straight into it) or a rename. */
type Naming = { mode: 'new'; forKey?: string } | { mode: 'rename'; category: ListCategory };

/**
 * Favorites or the wishlist, with the reader's own categories as filters above the grid. "All" shows
 * everything. Tap a category to filter, long-press it to rename, reorder or delete it, and long-press a title
 * to choose which categories it is in.
 */
export function ShelfView({ shelf, items, empty }: { shelf: Shelf; items: Series[]; empty: React.ReactElement }) {
  const t = useTheme();
  const lib = useLibrary();
  const cats = lib.categories[shelf].list;
  const [selected, setSelected] = useState<string | null>(null);
  const [naming, setNaming] = useState<Naming | null>(null);
  const [menuFor, setMenuFor] = useState<ListCategory | null>(null);
  const [assignKey, setAssignKey] = useState<string | null>(null);

  // A deleted category can't stay selected.
  const active = selected && cats.some((c) => c.id === selected) ? selected : null;
  const shown = useMemo(() => filterByCategory(items, lib.categories, shelf, active), [items, lib.categories, shelf, active]);
  const counts = useMemo(() => countByCategory(items, lib.categories, shelf), [items, lib.categories, shelf]);
  const assignTitle = assignKey ? items.find((s) => s.key === assignKey) : undefined;

  if (items.length === 0) return empty;

  const chip = (key: string, label: string, on: boolean, onPress: () => void, onLongPress?: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.chip, { backgroundColor: on ? t.accent : t.card }]}
    >
      <Text style={{ color: on ? '#fff' : t.sub, fontSize: 13, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );

  const saveName = (name: string) => {
    if (!naming) return;
    if (naming.mode === 'rename') lib.renameCategory(shelf, naming.category.id, name);
    else {
      const id = lib.addCategory(shelf, name);
      if (id && naming.forKey) lib.setInCategory(shelf, naming.forKey, id, true);
    }
    setNaming(null);
  };

  const confirmDelete = (c: ListCategory) =>
    Alert.alert(`Delete “${c.name}”?`, 'The titles in it stay in your list; only the category is removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => lib.deleteCategory(shelf, c.id) },
    ]);

  const activeName = cats.find((c) => c.id === active)?.name;

  return (
    <View style={styles.flex}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipBar}
        keyboardShouldPersistTaps="handled"
      >
        {chip('all', `All (${items.length})`, !active, () => setSelected(null))}
        {cats.map((c) =>
          chip(
            c.id,
            `${c.name} (${counts[c.id] ?? 0})`,
            active === c.id,
            () => setSelected(c.id),
            () => setMenuFor(c),
          ),
        )}
        <Pressable
          onPress={() => setNaming({ mode: 'new' })}
          style={[styles.chip, styles.add, { borderColor: t.border }]}
          accessibilityLabel="New category"
        >
          <Ionicons name="add" size={15} color={t.accent} />
          <Text style={{ color: t.accent, fontSize: 13, fontWeight: '600' }}>{cats.length ? 'New' : 'New category'}</Text>
        </Pressable>
      </ScrollView>
      <Text style={[styles.hint, { color: t.sub }]}>
        {cats.length
          ? 'Long-press a title to choose its categories, or a category to edit it.'
          : 'Make categories to sort this list, then long-press a title to add it to one.'}
      </Text>

      <SeriesGrid
        data={shown}
        onLongPress={setAssignKey}
        empty={
          <EmptyState
            icon="pricetags-outline"
            title={`Nothing in “${activeName ?? ''}” yet`}
            message="Go to All and long-press a title to add it to this category."
          />
        }
      />

      <NamePrompt
        visible={!!naming}
        title={naming?.mode === 'rename' ? 'Rename category' : 'New category'}
        initial={naming?.mode === 'rename' ? naming.category.name : ''}
        problem={(name) => {
          const p = nameProblem(lib.categories, shelf, name, naming?.mode === 'rename' ? naming.category.id : undefined);
          return p ? NAME_PROBLEM_TEXT[p] : null;
        }}
        onSave={saveName}
        onClose={() => setNaming(null)}
      />

      <Sheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name ?? ''} t={t}>
        {menuFor ? (
          <>
            <SheetRow t={t} icon="create-outline" label="Rename" onPress={() => {
              setMenuFor(null);
              setNaming({ mode: 'rename', category: menuFor });
            }} />
            <SheetRow
              t={t}
              icon="arrow-back"
              label="Move left"
              disabled={cats[0]?.id === menuFor.id}
              onPress={() => lib.moveCategory(shelf, menuFor.id, -1)}
            />
            <SheetRow
              t={t}
              icon="arrow-forward"
              label="Move right"
              disabled={cats[cats.length - 1]?.id === menuFor.id}
              onPress={() => lib.moveCategory(shelf, menuFor.id, 1)}
            />
            <SheetRow t={t} icon="trash-outline" label="Delete" danger onPress={() => {
              setMenuFor(null);
              confirmDelete(menuFor);
            }} />
          </>
        ) : null}
      </Sheet>

      <Sheet
        visible={!!assignTitle}
        onClose={() => setAssignKey(null)}
        title={assignTitle ? `Categories for “${assignTitle.title}”` : ''}
        t={t}
      >
        {assignTitle ? (
          <>
            {cats.length === 0 ? (
              <Text style={[styles.sheetNote, { color: t.sub }]}>No categories yet. Make one to sort this title into it.</Text>
            ) : null}
            {cats.map((c) => {
              const on = categoriesOf(lib.categories, shelf, assignTitle.key).includes(c.id);
              return (
                <SheetRow
                  key={c.id}
                  t={t}
                  icon={on ? 'checkbox' : 'square-outline'}
                  iconColor={on ? t.accent : t.sub}
                  label={c.name}
                  onPress={() => lib.setInCategory(shelf, assignTitle.key, c.id, !on)}
                />
              );
            })}
            <SheetRow
              t={t}
              icon="add"
              iconColor={t.accent}
              label="New category…"
              onPress={() => {
                const key = assignTitle.key;
                setAssignKey(null);
                setNaming({ mode: 'new', forKey: key });
              }}
            />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

function Sheet({
  visible,
  onClose,
  title,
  t,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  t: Theme;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.sheetHead}>
          <Text numberOfLines={2} style={[styles.sheetTitle, { color: t.text }]}>
            {title}
          </Text>
          <Pressable hitSlop={10} onPress={onClose} accessibilityLabel="Done">
            <Text style={{ color: t.accent, fontWeight: '600', fontSize: 15 }}>Done</Text>
          </Pressable>
        </View>
        <ScrollView>{children}</ScrollView>
      </View>
    </Modal>
  );
}

function SheetRow({
  t,
  icon,
  iconColor,
  label,
  onPress,
  disabled,
  danger,
}: {
  t: Theme;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor?: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const color = danger ? t.danger : t.text;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.row, disabled && { opacity: 0.35 }]}>
      <Ionicons name={icon} size={22} color={iconColor ?? (danger ? t.danger : t.sub)} />
      <Text numberOfLines={1} style={[styles.rowText, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A small dialog with one text field (Android has no built-in prompt). */
function NamePrompt({
  visible,
  title,
  initial,
  problem,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  initial: string;
  problem: (name: string) => string | null;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);

  // Start from `initial` each time the dialog opens.
  const openKey = visible ? `${title}|${initial}` : null;
  if (openKey !== shownFor) {
    setShownFor(openKey);
    setName(initial);
    setError(null);
  }

  const submit = () => {
    const p = problem(name);
    if (p) setError(p);
    else onSave(name);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.center}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.dialog, { backgroundColor: t.bg }]}>
          <Text style={[styles.dialogTitle, { color: t.text }]}>{title}</Text>
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              setError(null);
            }}
            placeholder="e.g. Romance, Finished, Read next"
            placeholderTextColor={t.sub}
            autoFocus
            maxLength={MAX_NAME}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={[styles.input, { color: t.text, backgroundColor: t.card }]}
          />
          {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
          <View style={styles.dialogButtons}>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={{ color: t.sub, fontSize: 15, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} style={[styles.save, { backgroundColor: t.accent }]}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chipBar: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 12, paddingTop: 10, alignItems: 'center' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'transparent' },
  hint: { fontSize: 12, paddingHorizontal: 14, paddingTop: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { maxHeight: '70%', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingTop: 6 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12 },
  sheetTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  sheetNote: { paddingHorizontal: 18, paddingBottom: 8, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 13 },
  rowText: { flex: 1, fontSize: 15 },
  center: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.45)' },
  dialog: { borderRadius: 16, padding: 18, gap: 12 },
  dialogTitle: { fontSize: 16, fontWeight: '700' },
  input: { height: 46, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20, marginTop: 4 },
  save: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
});
