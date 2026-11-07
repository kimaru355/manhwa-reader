import { StorageAccessFramework as SAF } from 'expo-file-system/legacy';

import type { Chapter, Folder, Manhwa } from './types';
import { cleanTitle, hash, isPdf, mapLimit, naturalCompare, nameFromUri, stripPdf } from './util';

// Entries with these extensions are never directories; skip the pointless listing call.
const NOT_A_DIR = /\.(jpe?g|png|webp|gif|bmp|txt|json|zip|cbz|cbr|rar|7z|mp4|html?|js|css|db|ini|nomedia)$/i;

const toChapters = (uris: string[]): Chapter[] =>
  uris
    .map((uri) => ({ uri, name: stripPdf(nameFromUri(uri)) }))
    .sort((a, b) => naturalCompare(a.name, b.name));

const build = (dirUri: string, title: string, pdfs: string[], sourceUri: string): Manhwa => ({
  // Not the raw URI: it gets mangled when passed through route params.
  id: `m${hash(dirUri)}`,
  title,
  uri: dirUri,
  sourceUri,
  chapters: toChapters(pdfs),
});

const list = (uri: string) => SAF.readDirectoryAsync(uri).catch(() => [] as string[]);

/**
 * A manhwa is a folder that directly contains PDFs, one PDF per chapter.
 * Scans the chosen folder's immediate subfolders ("X - chapters" is shown as "X").
 * If none of them hold PDFs, the chosen folder itself is the manhwa.
 * Loose PDFs next to manhwa folders (e.g. merged copies) are ignored.
 */
export async function scanFolder(root: Folder): Promise<Manhwa[]> {
  const entries = await SAF.readDirectoryAsync(root.uri);
  const rootPdfs = entries.filter(isPdf);
  const dirs = entries.filter((u) => !isPdf(u) && !NOT_A_DIR.test(nameFromUri(u)));

  const found = await mapLimit(dirs, 4, async (dir) => {
    const pdfs = (await list(dir)).filter(isPdf);
    return pdfs.length ? build(dir, cleanTitle(nameFromUri(dir)), pdfs, root.uri) : null;
  });
  const result = found.filter((m): m is Manhwa => m !== null);

  if (result.length === 0 && rootPdfs.length) {
    return [build(root.uri, cleanTitle(root.name), rootPdfs, root.uri)];
  }
  return result;
}
