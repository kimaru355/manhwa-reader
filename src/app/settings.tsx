import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '../lib/account';
import { pickImportFile } from '../lib/backup';
import { friendly } from '../lib/errors';
import { clearTemp } from '../lib/files';
import { useLibrary } from '../lib/library';
import { useRecs } from '../lib/recs';
import { useTheme } from '../lib/theme';
import type { Snapshot } from '../lib/types';

const describe = (s: Snapshot) =>
  `Saved ${new Date(s.savedAt).toLocaleString()}\n${s.favorites.length} favorites · ` +
  `${s.wishlist.length} wishlist · ${s.recents.length} recent · ${s.bookmarks.length} bookmarks`;

export default function Settings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const {
    backupDir,
    lastBackup,
    backupError,
    pickBackupFolder,
    enableBackup,
    stopBackup,
    exportBackup,
    restoreSnapshot,
  } = useLibrary();
  const recs = useRecs();
  const account = useAccount();
  const [draft, setRecsUrl] = useState<string | null>(null);
  const recsUrl = draft ?? recs.url;

  const fail = (e: unknown) => Alert.alert('Something went wrong', friendly(e));

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

  const updated = recs.recs.updated ? ` · updated ${recs.recs.updated}` : '';

  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
        <Pressable hitSlop={12} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={t.text} />
        </Pressable>
        <Text style={[styles.barTitle, { color: t.text }]}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>
    <ScrollView contentContainerStyle={[styles.wrap, { paddingBottom: insets.bottom + 24 }]}>
      <Pressable onPress={() => router.push('/account')} style={[styles.folder, { backgroundColor: t.card }]}>
        <Ionicons name="person-circle-outline" size={28} color={t.accent} />
        <View style={styles.folderInfo}>
          <Text style={[styles.folderName, { color: t.text }]}>Account</Text>
          <Text style={{ color: t.sub, fontSize: 12 }}>
            {account.user ? account.user.email : 'Optional: sync bookmarks and share recommendations'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.sub} />
      </Pressable>

      <Text style={[styles.section, { color: t.sub, marginTop: 14 }]}>AUTHOR RECOMMENDATIONS</Text>
      <Text style={[styles.hint, { color: t.sub }]}>
        Home shows the author’s picks and chapter bookmarks from a JSON file. Paste its link to load a different
        list; leave it empty to use the list built into the app.
      </Text>
      <TextInput
        value={recsUrl}
        onChangeText={setRecsUrl}
        placeholder="https://…/recommendations.json"
        placeholderTextColor={t.sub}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        style={[styles.input, { backgroundColor: t.card, color: t.text }]}
      />
      <View style={styles.pair}>
        <Pressable
          onPress={() => {
            recs.setUrl(recsUrl);
            setRecsUrl(null);
          }}
          style={[styles.primary, styles.half, { backgroundColor: t.accent, marginTop: 0 }]}
        >
          {recs.loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="cloud-download" size={18} color="#fff" />}
          <Text style={styles.primaryText}>Save &amp; refresh</Text>
        </Pressable>
      </View>
      <Text style={{ color: recs.error ? t.danger : t.sub, fontSize: 12 }}>
        {recs.error ?? `${recs.recs.recommendations.length} recommendations${updated}`}
      </Text>

      <Text style={[styles.section, { color: t.sub, marginTop: 20 }]}>STORAGE</Text>
      <Text style={[styles.hint, { color: t.sub }]}>
        Chapters you open online are kept briefly so they load fast. Downloaded chapters stay until you delete them
        from their title or the Downloads tab.
      </Text>
      <Pressable
        onPress={() => clearTemp().then(() => Alert.alert('Cleared', 'Online reading cache emptied.'))}
        style={[styles.secondary, { borderColor: t.border }]}
      >
        <Ionicons name="trash-outline" size={18} color={t.text} />
        <Text style={{ color: t.text, fontSize: 15 }}>Clear reading cache</Text>
      </Pressable>

      <Text style={[styles.section, { color: t.sub, marginTop: 20 }]}>BACKUP &amp; RESTORE</Text>
      <Text style={[styles.hint, { color: t.sub }]}>
        Favorites, wishlist, history and bookmarks are saved to a “manhwa-reader” folder you choose, so they survive
        uninstalling the app. After a reinstall, choose the same folder to restore them. Downloaded chapters are not
        part of the backup.
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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  barTitle: { fontSize: 18, fontWeight: '700' },
  wrap: { padding: 16, gap: 10 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 4 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  input: { height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  folder: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  folderInfo: { flex: 1 },
  folderName: { fontSize: 16, fontWeight: '600' },
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
