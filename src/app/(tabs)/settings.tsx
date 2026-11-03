import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useLibrary } from '../../lib/library';
import { useTheme } from '../../lib/theme';

export default function Settings() {
  const t = useTheme();
  const { folders, library, scanning, scanError, addFolder, removeFolder, rescan } = useLibrary();

  const confirmRemove = (uri: string, name: string) =>
    Alert.alert(`Remove "${name}"?`, 'Your files are not deleted. The manhwa from this folder just leave the app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFolder(uri) },
    ]);

  const countFor = (uri: string) => library.filter((m) => m.sourceUri === uri).length;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={[styles.section, { color: t.sub }]}>MANHWA FOLDERS</Text>
      <Text style={[styles.hint, { color: t.sub }]}>
        Only these folders are scanned. Each manhwa is a folder holding one PDF per chapter (subfolders one level
        down are included).
      </Text>

      {folders.length === 0 ? (
        <Text style={[styles.empty, { color: t.sub }]}>No folders added.</Text>
      ) : (
        folders.map((f) => (
          <View key={f.uri} style={[styles.folder, { backgroundColor: t.card }]}>
            <Ionicons name="folder" size={26} color={t.accent} />
            <View style={styles.folderInfo}>
              <Text numberOfLines={1} style={[styles.folderName, { color: t.text }]}>
                {f.name}
              </Text>
              <Text style={{ color: t.sub, fontSize: 12 }}>{countFor(f.uri)} manhwa</Text>
            </View>
            <Pressable hitSlop={12} onPress={() => confirmRemove(f.uri, f.name)}>
              <Ionicons name="trash-outline" size={22} color={t.danger} />
            </Pressable>
          </View>
        ))
      )}

      {scanError ? <Text style={[styles.error, { color: t.danger }]}>{scanError}</Text> : null}

      <Pressable onPress={addFolder} style={[styles.primary, { backgroundColor: t.accent }]}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.primaryText}>Add folder</Text>
      </Pressable>

      {folders.length > 0 ? (
        <Pressable
          onPress={rescan}
          disabled={scanning}
          style={[styles.secondary, { borderColor: t.border, opacity: scanning ? 0.6 : 1 }]}
        >
          {scanning ? <ActivityIndicator color={t.accent} size="small" /> : <Ionicons name="refresh" size={18} color={t.text} />}
          <Text style={{ color: t.text, fontSize: 15 }}>{scanning ? 'Scanning…' : 'Rescan folders'}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 4 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  empty: { paddingVertical: 12 },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  folderInfo: { flex: 1 },
  folderName: { fontSize: 16, fontWeight: '600' },
  error: { fontSize: 13, lineHeight: 18 },
  primary: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 6,
  },
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
