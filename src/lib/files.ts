import * as FS from 'expo-file-system/legacy';

import { FriendlyError, friendly } from './errors';
import { hash, mapLimit } from './util';

/** Chapters the user chose to keep. */
export const SAVED = `${FS.documentDirectory}dl/`;
/** Chapters opened online; pruned automatically. */
export const TEMP = `${FS.cacheDirectory}read/`;

export const seriesDir = (key: string) => `${SAVED}${hash(key)}/`;
export const chapterDir = (key: string, chapterId: string, saved: boolean) =>
  `${saved ? SAVED : TEMP}${hash(key)}/${hash(chapterId)}/`;

export const extOf = (url: string) => url.split(/[?#]/)[0].match(/\.(jpe?g|png|webp|gif|avif)$/i)?.[1].toLowerCase() ?? 'jpg';

async function exists(path: string) {
  const info = await FS.getInfoAsync(path);
  return info.exists && (info as { size?: number }).size !== 0;
}

export async function downloadFile(url: string, dest: string, headers: Record<string, string>) {
  if (await exists(dest)) return;
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await FS.downloadAsync(url, dest, { headers });
      if (res.status === 200) return;
      last = new Error(`Image request answered ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  await FS.deleteAsync(dest, { idempotent: true }).catch(() => {});
  throw new FriendlyError(friendly(last));
}

/** File name of page `index` (0-based) of a chapter, e.g. `007.jpg`. */
export const pageName = (url: string, index: number) => `${String(index + 1).padStart(3, '0')}.${extOf(url)}`;

/**
 * Downloads every page of a chapter into `dir` at full quality. Pages already on disk are skipped,
 * so an interrupted download resumes. Returns the file names in reading order.
 */
export async function fetchPages(
  urls: string[],
  dir: string,
  headers: Record<string, string>,
  onProgress?: (done: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<string[]> {
  await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const names = urls.map(pageName);
  let done = 0;
  onProgress?.(0, urls.length);
  await mapLimit(urls, 4, async (url, i) => {
    if (shouldStop?.()) throw new Error('Cancelled');
    await downloadFile(url, `${dir}${names[i]}`, headers);
    onProgress?.(++done, urls.length);
  });
  return names;
}

const DONE = '_done.json';

/** File names of a chapter that finished downloading into `dir`, or null if it is not (fully) there. */
export async function readDone(dir: string): Promise<string[] | null> {
  try {
    const names = JSON.parse(await FS.readAsStringAsync(`${dir}${DONE}`)) as string[];
    return Array.isArray(names) && names.length ? names : null;
  } catch {
    return null;
  }
}

export const markDone = (dir: string, names: string[]) =>
  FS.writeAsStringAsync(`${dir}${DONE}`, JSON.stringify(names)).catch(() => {});

export const removeDir = (dir: string) => FS.deleteAsync(dir, { idempotent: true }).catch(() => {});

/** Keeps only the few most recently opened online chapters. */
export async function pruneTemp(keep = 3) {
  try {
    const series = await FS.readDirectoryAsync(TEMP);
    const dirs: { path: string; time: number }[] = [];
    for (const s of series) {
      for (const c of await FS.readDirectoryAsync(`${TEMP}${s}`)) {
        const path = `${TEMP}${s}/${c}/`;
        const info = await FS.getInfoAsync(path);
        dirs.push({ path, time: info.exists ? ((info as { modificationTime?: number }).modificationTime ?? 0) : 0 });
      }
    }
    dirs.sort((a, b) => b.time - a.time);
    await Promise.all(dirs.slice(keep).map((d) => removeDir(d.path)));
  } catch {}
}

export const clearTemp = () => removeDir(TEMP);
