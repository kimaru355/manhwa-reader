import * as DocumentPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';

import type { Folder, Snapshot } from './types';
import { nameFromUri } from './util';

const SAF = FS.StorageAccessFramework;
export const BACKUP_DIR = 'manhwa-reader';
const FILE_BASE = 'manhwa-reader-data';

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/** Returns a clean snapshot, or null if the text is not a Manhwa Reader backup. */
export function parseSnapshot(text: string): Snapshot | null {
  try {
    const o = JSON.parse(text);
    if (!o || o.app !== 'manhwa-reader') return null;
    // Version 1 backups described PDF folders, which no longer exist in the app.
    if (o.version !== 2) throw new Error('This backup was made by an older version of the app and cannot be imported.');
    return {
      app: 'manhwa-reader',
      version: 2,
      savedAt: typeof o.savedAt === 'number' ? o.savedAt : Date.now(),
      favorites: isArr(o.favorites) ? (o.favorites as Snapshot['favorites']) : [],
      wishlist: isArr(o.wishlist) ? (o.wishlist as Snapshot['wishlist']) : [],
      recents: isArr(o.recents) ? (o.recents as Snapshot['recents']) : [],
      bookmarks: isArr(o.bookmarks) ? (o.bookmarks as Snapshot['bookmarks']) : [],
    };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('This backup')) throw e;
    return null;
  }
}

/**
 * Android 11+ will not let an app pick the storage root or write under /Android, so the user picks
 * (or creates) a folder and we keep our data in a "manhwa-reader" folder. If they picked one that is
 * already called that, it is used directly.
 */
export async function resolveBackupDir(picked: string): Promise<Folder> {
  if (nameFromUri(picked).toLowerCase() === BACKUP_DIR) return { uri: picked, name: BACKUP_DIR };
  const kids = await SAF.readDirectoryAsync(picked);
  const existing = kids.find((k) => nameFromUri(k).toLowerCase() === BACKUP_DIR);
  const uri = existing ?? (await SAF.makeDirectoryAsync(picked, BACKUP_DIR));
  return { uri, name: BACKUP_DIR };
}

const dataFiles = async (dir: string) =>
  (await SAF.readDirectoryAsync(dir)).filter((k) => nameFromUri(k).startsWith(FILE_BASE));

export async function readBackup(dir: string): Promise<Snapshot | null> {
  for (const f of await dataFiles(dir)) {
    try {
      const s = parseSnapshot(await FS.readAsStringAsync(f));
      if (s) return s;
    } catch {
      // Unreadable or older-format file: treat as no backup.
    }
  }
  return null;
}

export async function writeBackup(dir: string, snapshot: Snapshot): Promise<void> {
  const text = JSON.stringify(snapshot);
  const [existing] = await dataFiles(dir);
  if (existing) {
    try {
      await FS.writeAsStringAsync(existing, text);
      return;
    } catch {
      await FS.deleteAsync(existing, { idempotent: true }).catch(() => {});
    }
  }
  const file = await SAF.createFileAsync(dir, `${FILE_BASE}.json`, 'application/json');
  await FS.writeAsStringAsync(file, text);
}

/** Writes a dated copy into a folder the user picks. Returns the folder name, or null if cancelled. */
export async function exportSnapshot(snapshot: Snapshot): Promise<string | null> {
  const res = await SAF.requestDirectoryPermissionsAsync();
  if (!res.granted) return null;
  const day = new Date().toISOString().slice(0, 10);
  const file = await SAF.createFileAsync(res.directoryUri, `manhwa-reader-export-${day}.json`, 'application/json');
  await FS.writeAsStringAsync(file, JSON.stringify(snapshot));
  return nameFromUri(res.directoryUri) || 'the folder';
}

/** Lets the user pick a backup file. Null if cancelled; throws if the file is not a backup. */
export async function pickImportFile(): Promise<Snapshot | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.[0]) return null;
  const text = await FS.readAsStringAsync(res.assets[0].uri);
  const s = parseSnapshot(text);
  if (!s) throw new Error('That file is not a Manhwa Reader backup.');
  return s;
}
