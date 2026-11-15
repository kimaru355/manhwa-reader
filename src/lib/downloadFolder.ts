import { Directory, File } from 'expo-file-system';
import * as FS from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { resolveBackupDir } from './backup';
import { FriendlyError } from './errors';
import { cleanSeries } from './snapshotShape';
import type { Chapter, DownloadedChapter, DownloadedSeries, Folder, Series } from './types';
import { hash, mapLimit, nameFromUri } from './util';

/**
 * Downloads kept in a folder the user picks (shared storage) survive uninstalling the app; the app's own
 * storage does not. Android only: elsewhere chapters stay in the app's storage.
 */
export const folderSupported = Platform.OS === 'android';

const SAF = FS.StorageAccessFramework;
const DOWNLOADS = 'downloads';
/** Describes a title's downloads, so they can be found again after a reinstall. */
const MANIFEST = 'series.json';

/** Chapters downloaded for the folder wait here until every page is in, then are copied over. */
export const STAGE = `${FS.cacheDirectory}dl-stage/`;
export const stageDir = (key: string, chapterId: string) => `${STAGE}${hash(key)}/${hash(chapterId)}/`;

/** A name that is safe as a folder name on any Android storage. */
const safeName = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 60)
    .trim() || 'Untitled';

// The hash keeps two titles (or chapters) with the same name apart.
const seriesFolderName = (s: Series) => `${safeName(s.title)} - ${hash(s.key)}`;
const chapterFolderName = (c: Chapter) => `${safeName(c.name)} - ${hash(c.id)}`;

async function children(dir: string) {
  return new Map((await SAF.readDirectoryAsync(dir)).map((u) => [nameFromUri(u), u]));
}

async function childDir(parent: string, name: string) {
  return (await children(parent)).get(name) ?? (await SAF.makeDirectoryAsync(parent, name));
}

/**
 * Lets the user pick a folder and returns the "manhwa-reader/downloads" folder inside it (made if needed).
 * Null if they cancelled.
 */
export async function pickDownloadFolder(): Promise<Folder | null> {
  const res = await SAF.requestDirectoryPermissionsAsync();
  if (!res.granted) return null;
  const app = await resolveBackupDir(res.directoryUri);
  const uri = await childDir(app.uri, DOWNLOADS);
  // Folders are found again by name, which only works on storage that names them by path (this phone or an SD card).
  if (nameFromUri(uri) !== DOWNLOADS) {
    throw new FriendlyError('Choose a folder on this phone’s storage or SD card, not a cloud drive.');
  }
  const picked = nameFromUri(res.directoryUri);
  const name = picked.toLowerCase() === 'manhwa-reader' ? `${picked}/${DOWNLOADS}` : `${picked || 'Storage'}/manhwa-reader/${DOWNLOADS}`;
  return { uri, name };
}

/** Whether the app can still use the folder (access is lost after a reinstall, or if the folder was deleted). */
export async function folderUsable(dir: string) {
  try {
    await SAF.readDirectoryAsync(dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies a chapter whose pages are all in `localDir` into the title's folder. Returns the folders' addresses
 * and the pages' addresses in reading order.
 */
export async function saveChapterToFolder(
  root: string,
  series: Series,
  chapter: Chapter,
  localDir: string,
  names: string[],
): Promise<{ seriesDir: string; dir: string; uris: string[] }> {
  const seriesDir = await childDir(root, seriesFolderName(series));
  const name = chapterFolderName(chapter);
  // Left over from an attempt that was cut off: start that chapter clean.
  const old = (await children(seriesDir)).get(name);
  if (old) await FS.deleteAsync(old, { idempotent: true });
  const dir = await SAF.makeDirectoryAsync(seriesDir, name);
  const target = new Directory(dir);
  await mapLimit(names, 4, (n) => new File(`${localDir}${n}`).copy(target));
  const saved = await children(dir);
  const uris = names.map((n) => saved.get(n));
  if (uris.some((u) => !u)) {
    await FS.deleteAsync(dir, { idempotent: true }).catch(() => {});
    throw new FriendlyError('Couldn’t save every page to the download folder.');
  }
  return { seriesDir, dir, uris: uris as string[] };
}

/** Copies a title's cover into its folder. Returns its address there. */
export async function saveCoverToFolder(root: string, series: Series, localFile: string): Promise<{ seriesDir: string; uri: string }> {
  const seriesDir = await childDir(root, seriesFolderName(series));
  const file = new File(localFile);
  await file.copy(new Directory(seriesDir), { overwrite: true });
  const uri = (await children(seriesDir)).get(file.name);
  if (!uri) throw new Error('Cover was not saved');
  return { seriesDir, uri };
}

type ManifestChapter = Chapter & { files: string[]; ts: number; folder: string };
type Manifest = { app: 'manhwa-reader'; kind: 'downloads'; version: 1; series: Series; cover?: string; chapters: ManifestChapter[] };

/** Writes (or replaces) the description of a title's downloads in its folder. */
export async function writeManifest(item: DownloadedSeries) {
  if (!item.dir) return;
  const inFolder = item.chapters.filter((c) => c.dir && c.uris);
  const manifest: Manifest = {
    app: 'manhwa-reader',
    kind: 'downloads',
    version: 1,
    series: item.series,
    ...(item.cover?.startsWith('content:') ? { cover: nameFromUri(item.cover) } : {}),
    chapters: inFolder.map(({ dir, uris, ...c }) => ({ ...c, folder: nameFromUri(dir!) })),
  };
  const kids = await children(item.dir);
  // Rewriting a file in place can leave the end of a longer old version behind, so it is replaced instead.
  const old = kids.get(MANIFEST);
  if (old) await FS.deleteAsync(old, { idempotent: true });
  const file = await SAF.createFileAsync(item.dir, MANIFEST, 'application/json');
  await FS.writeAsStringAsync(file, JSON.stringify(manifest));
}

function parseManifest(text: string): Manifest | null {
  try {
    const o = JSON.parse(text);
    if (!o || o.app !== 'manhwa-reader' || o.kind !== 'downloads' || !Array.isArray(o.chapters)) return null;
    const series = cleanSeries(o.series);
    if (!series) return null;
    const chapters = (o.chapters as unknown[]).filter(
      (c): c is ManifestChapter =>
        !!c &&
        typeof (c as ManifestChapter).id === 'string' &&
        typeof (c as ManifestChapter).name === 'string' &&
        typeof (c as ManifestChapter).folder === 'string' &&
        Array.isArray((c as ManifestChapter).files) &&
        (c as ManifestChapter).files.every((f) => typeof f === 'string'),
    );
    return { app: 'manhwa-reader', kind: 'downloads', version: 1, series, cover: typeof o.cover === 'string' ? o.cover : undefined, chapters };
  } catch {
    return null;
  }
}

/** Finds the downloads already in a folder (for example from before the app was reinstalled). */
export async function scanFolder(root: string): Promise<DownloadedSeries[]> {
  const out: DownloadedSeries[] = [];
  for (const seriesDir of (await children(root)).values()) {
    try {
      const kids = await children(seriesDir);
      const manifestUri = kids.get(MANIFEST);
      if (!manifestUri) continue;
      const m = parseManifest(await FS.readAsStringAsync(manifestUri));
      if (!m) continue;
      const chapters: DownloadedChapter[] = [];
      for (const { folder, ...c } of m.chapters) {
        const dir = kids.get(folder);
        if (!dir) continue;
        const pages = await children(dir).catch(() => new Map<string, string>());
        const uris = c.files.map((f) => pages.get(f));
        // A chapter missing pages is left out; it can be downloaded again.
        if (uris.every(Boolean)) chapters.push({ ...c, ts: typeof c.ts === 'number' ? c.ts : Date.now(), dir, uris: uris as string[] });
      }
      if (chapters.length) {
        out.push({ series: m.series, dir: seriesDir, cover: m.cover ? kids.get(m.cover) : undefined, chapters });
      }
    } catch {
      // One unreadable title doesn't hide the others.
    }
  }
  return out;
}
