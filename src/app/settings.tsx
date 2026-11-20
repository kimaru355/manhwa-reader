import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppUpdateCard } from '../components/AppUpdateCard';
import { useAccount } from '../lib/account';
import { downloadAppUpdate, installsUpdates, useAppUpdate } from '../lib/appUpdate';
import { pickImportFile } from '../lib/backup';
import { folderSupported } from '../lib/downloadFolder';
import { useDownloads } from '../lib/downloads';
import { friendly } from '../lib/errors';
import { clearTemp } from '../lib/files';
import { useLibrary } from '../lib/library';
import { useRecs } from '../lib/recs';
import { useTheme } from '../lib/theme';
import type { Snapshot } from '../lib/types';
import { canSelfUpdate, installedName, openDownload } from '../lib/update';
import { useUpdater } from '../lib/useUpdater';

const describe = (s: Snapshot) => {
  const cats = s.categories ? s.categories.favorites.list.length + s.categories.wishlist.list.length : 0;
  return (
    `Saved ${new Date(s.savedAt).toLocaleString()}\n${s.favorites.length} favorites · ` +
    `${s.wishlist.length} wishlist · ${s.recents.length} recent · ${s.bookmarks.length} bookmarks` +
    (cats ? ` · ${cats} categories` : '')
  );
};

const ago = (ms: number) => {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return new Date(ms).toLocaleString();
};

export default function Settings() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const lib = useLibrary();
  const recs = useRecs();
  const updater = useUpdater();
  const appUpdate = useAppUpdate();
  const account = useAccount();
  const dl = useDownloads();
  const [draft, setRecsUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const recsUrl = draft ?? recs.url;

  const fail = (e: unknown) => Alert.alert('Something went wrong', friendly(e));

  const chooseBackup = async () => {
    try {
      const picked = await lib.pickBackupFolder();
      if (!picked) return;
      const { dir, found } = picked;
      if (!found) {
        await lib.enableBackup(dir, null);
        return;
      }
      Alert.alert('Backup found', `${describe(found)}\n\nRestore it, or replace it with the data on this phone?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use this phone’s data', style: 'destructive', onPress: () => lib.enableBackup(dir, null).catch(fail) },
        { text: 'Restore backup', onPress: () => lib.enableBackup(dir, found).catch(fail) },
      ]);
    } catch (e) {
      fail(e);
    }
  };

  const chooseFolder = async () => {
    try {
      const res = await dl.chooseFolder();
      if (res?.found) {
        Alert.alert('Downloads found', `${res.found} downloaded title${res.found === 1 ? ' was' : 's were'} found in that folder and added to Downloads.`);
      }
    } catch (e) {
      Alert.alert('Couldn’t use that folder', friendly(e));
    }
  };

  const doShare = async () => {
    setSharing(true);
    try {
      if (!(await lib.shareBackup())) {
        Alert.alert('Sharing is not available', 'Use “Save to folder” instead, then send the file from there.');
      }
    } catch (e) {
      fail(e);
    } finally {
      setSharing(false);
    }
  };

  const doSave = async () => {
    try {
      const where = await lib.exportBackup();
      if (where) Alert.alert('Saved', `Saved a file of your data in "${where}".`);
    } catch (e) {
      fail(e);
    }
  };

  const doImport = async () => {
    try {
      const s = await pickImportFile();
      if (!s) return;
      Alert.alert(
        'Import this file?',
        `${describe(s)}\n\n“Add to my library” keeps everything here and adds what the file has. “Replace” swaps your data for the file’s.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () =>
              Alert.alert('Replace your data?', 'Your favorites, wishlist, history, bookmarks and categories become the file’s.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Replace', style: 'destructive', onPress: () => lib.restoreSnapshot(s) },
              ]),
          },
          {
            text: 'Add to my library',
            onPress: () => {
              lib.mergeSnapshotIn(s);
              Alert.alert('Imported', 'The file’s titles, bookmarks and categories were added to your library.');
            },
          },
        ],
      );
    } catch (e) {
      fail(e);
    }
  };

  const updated = recs.recs.updated ? ` · updated ${recs.recs.updated}` : '';
  const u = updater.state;

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
        {/* ---------------------------------------------------------------- Account & sync */}
        {account.enabled ? (
          <>
            <Text style={[styles.section, { color: t.sub }]}>ACCOUNT &amp; SYNC</Text>
            <Pressable onPress={() => router.push('/account')} style={[styles.card, { backgroundColor: t.card }]}>
              <Ionicons name="person-circle-outline" size={28} color={t.accent} />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: t.text }]}>Account</Text>
                <Text style={{ color: t.sub, fontSize: 12 }}>
                  {account.user ? account.user.email : 'Optional: sync your library and share recommendations'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.sub} />
            </Pressable>

            <View style={[styles.card, { backgroundColor: t.card }]}>
              <Ionicons name="sync-outline" size={26} color={t.accent} />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: t.text }]}>Sync</Text>
                <Text style={{ color: account.syncError ? t.danger : t.sub, fontSize: 12 }}>
                  {!account.user
                    ? 'Sign in to keep favorites, wishlist, bookmarks and categories the same on your phone and the website.'
                    : account.syncError
                      ? account.syncError
                      : account.syncing
                        ? 'Syncing…'
                        : account.lastSync
                          ? `Synced ${ago(account.lastSync)}. Changes also sync on their own.`
                          : 'Not synced yet'}
                </Text>
              </View>
            </View>
            {account.user ? (
              <Pressable
                onPress={() => account.syncNow()}
                disabled={account.syncing}
                style={[styles.primary, { backgroundColor: t.accent, opacity: account.syncing ? 0.6 : 1 }]}
              >
                {account.syncing ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="sync" size={18} color="#fff" />}
                <Text style={styles.primaryText}>{account.syncing ? 'Syncing…' : 'Sync now'}</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push('/account')} style={[styles.primary, { backgroundColor: t.accent }]}>
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={styles.primaryText}>Sign in to sync</Text>
              </Pressable>
            )}
          </>
        ) : null}

        {/* ---------------------------------------------------------------- Export & import */}
        <Text style={[styles.section, { color: t.sub, marginTop: 20 }]}>EXPORT &amp; IMPORT</Text>
        <Text style={[styles.hint, { color: t.sub }]}>
          Put your favorites, wishlist, history, bookmarks and categories in one file: keep it as a backup, or send it
          to another phone (no internet needed with Bluetooth or Quick Share). Importing a file can add to your library
          or replace it. Downloaded chapters are not included.
        </Text>
        <View style={styles.pair}>
          <Pressable onPress={doShare} disabled={sharing} style={[styles.secondary, styles.half, { borderColor: t.border }]}>
            {sharing ? <ActivityIndicator color={t.accent} size="small" /> : <Ionicons name="share-social-outline" size={18} color={t.text} />}
            <Text style={{ color: t.text, fontSize: 15 }}>Share file</Text>
          </Pressable>
          <Pressable onPress={doSave} style={[styles.secondary, styles.half, { borderColor: t.border }]}>
            <Ionicons name="save-outline" size={18} color={t.text} />
            <Text style={{ color: t.text, fontSize: 15 }}>Save to folder</Text>
          </Pressable>
        </View>
        <Pressable onPress={doImport} style={[styles.secondary, { borderColor: t.border }]}>
          <Ionicons name="download-outline" size={18} color={t.text} />
          <Text style={{ color: t.text, fontSize: 15 }}>Import a file</Text>
        </Pressable>

        {/* ---------------------------------------------------------------- Updates */}
        {canSelfUpdate ? (
          <>
            <Text style={[styles.section, { color: t.sub, marginTop: 20 }]}>UPDATES</Text>
            <View style={[styles.card, { backgroundColor: t.card }]}>
              <Ionicons
                name={u.kind === 'available' ? 'gift-outline' : u.kind === 'current' ? 'checkmark-circle-outline' : 'cloud-download-outline'}
                size={26}
                color={t.accent}
              />
              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, { color: t.text }]}>
                  {u.kind === 'available' ? `Version ${u.info.versionName || u.info.versionCode} is available` : `Version ${installedName()}`}
                </Text>
                <Text style={{ color: u.kind === 'error' ? t.danger : t.sub, fontSize: 12 }}>
                  {u.kind === 'checking'
                    ? 'Checking for updates…'
                    : u.kind === 'current'
                      ? 'You have the latest version.'
                      : u.kind === 'available'
                        ? (u.info.notes ?? 'A newer version is ready to download.')
                        : u.kind === 'error'
                          ? u.message
                          : 'The app also checks each time it opens.'}
                </Text>
              </View>
            </View>
            {u.kind === 'available' && installsUpdates && appUpdate ? (
              <AppUpdateCard />
            ) : u.kind === 'available' && installsUpdates ? (
              <Pressable onPress={() => downloadAppUpdate(u.info)} style={[styles.primary, { backgroundColor: t.accent }]}>
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.primaryText}>Download update</Text>
              </Pressable>
            ) : u.kind === 'available' ? (
              <Pressable onPress={openDownload} style={[styles.primary, { backgroundColor: t.accent }]}>
                <Ionicons name="open-outline" size={18} color="#fff" />
                <Text style={styles.primaryText}>Get it from the website</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => updater.check()}
                disabled={u.kind === 'checking'}
                style={[styles.secondary, { borderColor: t.border, opacity: u.kind === 'checking' ? 0.6 : 1 }]}
              >
                {u.kind === 'checking' ? <ActivityIndicator color={t.accent} size="small" /> : <Ionicons name="refresh" size={18} color={t.text} />}
                <Text style={{ color: t.text, fontSize: 15 }}>Check for updates</Text>
              </Pressable>
            )}
          </>
        ) : null}

        {/* ---------------------------------------------------------------- Recommendations */}
        <Text style={[styles.section, { color: t.sub, marginTop: 20 }]}>AUTHOR RECOMMENDATIONS</Text>
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

        {/* ---------------------------------------------------------------- Download folder */}
        {folderSupported ? (
          <>
            <Text style={[styles.section, { color: t.sub, marginTop: 20 }]}>DOWNLOAD FOLDER</Text>
            <Text style={[styles.hint, { color: t.sub }]}>
              Downloaded chapters saved in a folder you choose stay on your phone even if the app is uninstalled.
              After a reinstall, choose the same folder to get them back. Chapters in the app’s storage are deleted
              with the app.
            </Text>
            <View style={[styles.card, { backgroundColor: t.card }]}>
              <Ionicons name={dl.folder ? 'folder-outline' : 'phone-portrait-outline'} size={26} color={t.accent} />
              <View style={styles.cardInfo}>
                <Text numberOfLines={2} style={[styles.cardTitle, { color: t.text }]}>
                  {dl.folder ? dl.folder.name : dl.folderDecided ? 'App storage' : 'Not chosen yet'}
                </Text>
                <Text style={{ color: dl.folderLost && !dl.folder ? t.danger : t.sub, fontSize: 12 }}>
                  {dl.moving
                    ? `Moving downloads into the folder… ${dl.moving.done}/${dl.moving.total}`
                    : dl.folderLost && !dl.folder
                      ? 'The app can no longer open your download folder. Choose it again.'
                      : dl.folder
                        ? 'New downloads are saved here.'
                        : dl.folderDecided
                          ? 'Deleted if the app is uninstalled.'
                          : 'You’ll be asked before your first download.'}
                </Text>
              </View>
              {dl.moving ? <ActivityIndicator color={t.accent} size="small" /> : null}
            </View>
            <Pressable onPress={chooseFolder} style={[styles.secondary, { borderColor: t.border }]}>
              <Ionicons name="folder-open-outline" size={18} color={t.text} />
              <Text style={{ color: t.text, fontSize: 15 }}>{dl.folder ? 'Change download folder' : 'Choose download folder'}</Text>
            </Pressable>
            {dl.folder ? (
              <Pressable
                onPress={() =>
                  Alert.alert(
                    'Save new downloads in the app?',
                    'Chapters already in the folder stay there. New ones are deleted if the app is uninstalled.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Use app storage', onPress: dl.keepInAppStorage },
                    ],
                  )
                }
                style={[styles.secondary, { borderColor: t.border }]}
              >
                <Ionicons name="phone-portrait-outline" size={18} color={t.text} />
                <Text style={{ color: t.text, fontSize: 15 }}>Use app storage instead</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {/* ---------------------------------------------------------------- Storage */}
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

        {/* ---------------------------------------------------------------- Automatic backup */}
        <Text style={[styles.section, { color: t.sub, marginTop: 20 }]}>AUTOMATIC BACKUP</Text>
        <Text style={[styles.hint, { color: t.sub }]}>
          Keeps a copy of your data in a “manhwa-reader” folder you choose, updated as you go, so it survives
          uninstalling the app. After a reinstall, choose the same folder to restore it.
        </Text>

        {lib.backupDir ? (
          <View style={[styles.card, { backgroundColor: t.card }]}>
            <Ionicons name="cloud-done-outline" size={26} color={t.accent} />
            <View style={styles.cardInfo}>
              <Text numberOfLines={1} style={[styles.cardTitle, { color: t.text }]}>
                Auto-saving to {lib.backupDir.name}
              </Text>
              <Text style={{ color: lib.backupError ? t.danger : t.sub, fontSize: 12 }}>
                {lib.backupError ?? (lib.lastBackup ? `Last saved ${new Date(lib.lastBackup).toLocaleString()}` : 'Saving…')}
              </Text>
            </View>
            <Pressable hitSlop={12} onPress={lib.stopBackup} accessibilityLabel="Stop automatic backup">
              <Ionicons name="close-circle-outline" size={22} color={t.sub} />
            </Pressable>
          </View>
        ) : null}

        <Pressable onPress={chooseBackup} style={[styles.secondary, { borderColor: t.border }]}>
          <Ionicons name="folder-open-outline" size={18} color={t.text} />
          <Text style={{ color: t.text, fontSize: 15 }}>{lib.backupDir ? 'Change backup folder' : 'Choose backup folder'}</Text>
        </Pressable>
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
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  cardInfo: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  primary: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
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
