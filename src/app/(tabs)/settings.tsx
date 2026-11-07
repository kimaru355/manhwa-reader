import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { pickImportFile } from '../../lib/backup';
import { useLibrary } from '../../lib/library';
import { useTheme } from '../../lib/theme';
import type { Snapshot } from '../../lib/types';

const describe = (s: Snapshot) =>
  `Saved ${new Date(s.savedAt).toLocaleString()}\n${s.folders.length} folders · ${s.favorites.length} favorites · ` +
  `${s.wishlist.length} wishlist · ${s.recents.length} recent · ${s.bookmarks.length} bookmarks`;

export default function Settings() {
  const t = useTheme();
  const {
    folders,
    library,
    scanning,
    scanError,
    addFolder,
    removeFolder,
    rescan,
    backupDir,
    lastBackup,
    backupError,
    pickBackupFolder,
    enableBackup,
    stopBackup,
    exportBackup,
    restoreSnapshot,
  } = useLibrary();

  const fail = (e: unknown) => Alert.alert('Something went wrong', String((e as Error)?.message ?? e));

  const chooseBackup = async () => {
    try {
      const picked = await pickBackupFolder();
      if (!picked) return;
      const { dir, found } = picked;
      if (!found) {
        await enableBackup(dir, null);
        return;
      }
      Alert.alert('Backup found', `${describe(found)}\n\nRestore it, or replace it with the data on this phone?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use this phone’s data', style: 'destructive', onPress: () => enableBackup(dir, null).catch(fail) },
        { text: 'Restore backup', onPress: () => enableBackup(dir, found).catch(fail) },
      ]);
    } catch (e) {
      fail(e);
    }
  };

  const doExport = async () => {
    try {
      const where = await exportBackup();
      if (where) Alert.alert('Exported', `Saved a backup file in "${where}".`);
    } catch (e) {
      fail(e);
    }
  };

  const doImport = async () => {
    try {
      const s = await pickImportFile();
      if (!s) return;
      Alert.alert('Import this backup?', `${describe(s)}\n\nThis replaces the data currently in the app.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', style: 'destructive', onPress: () => restoreSnapshot(s) },
      ]);
    } catch (e) {
      fail(e);
    }
  };

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
        Only these folders are scanned. Each manhwa is a folder holding one PDF per chapter; the folders directly
        inside a folder you add are listed.
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

      <Text style={[styles.section, { color: t.sub, marginTop: 20 }]}>BACKUP &amp; RESTORE</Text>
      <Text style={[styles.hint, { color: t.sub }]}>
        Favorites, wishlist, history, bookmarks and your folder list are saved to a “manhwa-reader” folder you
        choose, so they survive uninstalling the app. After a reinstall, choose the same folder to restore them,
        then add your manhwa folders again to re-grant access.
      </Text>

      {backupDir ? (
        <View style={[styles.folder, { backgroundColor: t.card }]}>
          <Ionicons name="cloud-done-outline" size={26} color={t.accent} />
          <View style={styles.folderInfo}>
            <Text numberOfLines={1} style={[styles.folderName, { color: t.text }]}>
              Auto-saving to {backupDir.name}
            </Text>
            <Text style={{ color: backupError ? t.danger : t.sub, fontSize: 12 }}>
              {backupError ?? (lastBackup ? `Last saved ${new Date(lastBackup).toLocaleString()}` : 'Saving…')}
            </Text>
          </View>
          <Pressable hitSlop={12} onPress={stopBackup}>
            <Ionicons name="close-circle-outline" size={22} color={t.sub} />
          </Pressable>
        </View>
      ) : null}

      <Pressable onPress={chooseBackup} style={[styles.primary, { backgroundColor: t.accent }]}>
        <Ionicons name="folder-open" size={20} color="#fff" />
        <Text style={styles.primaryText}>{backupDir ? 'Change backup folder' : 'Choose backup folder'}</Text>
      </Pressable>

      <View style={styles.pair}>
        <Pressable onPress={doExport} style={[styles.secondary, styles.half, { borderColor: t.border }]}>
          <Ionicons name="share-outline" size={18} color={t.text} />
          <Text style={{ color: t.text, fontSize: 15 }}>Export</Text>
        </Pressable>
        <Pressable onPress={doImport} style={[styles.secondary, styles.half, { borderColor: t.border }]}>
          <Ionicons name="download-outline" size={18} color={t.text} />
          <Text style={{ color: t.text, fontSize: 15 }}>Import</Text>
        </Pressable>
      </View>
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
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
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
