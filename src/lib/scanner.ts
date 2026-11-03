import { StorageAccessFramework as SAF } from 'expo-file-system/legacy';

import type { Chapter, Folder, Manhwa } from './types';
import { cleanTitle, isPdf, mapLimit, naturalCompare, nameFromUri, stripPdf } from './util';

// Entries with these extensions are never directories; skip the pointless listing call.
const NOT_A_DIR = /\.(jpe?g|png|webp|gif|bmp|txt|json|zip|cbz|cbr|rar|7z|mp4|html?|js|css|db|ini|nomedia)$/i;

const toChapters = (uris: string[]): Chapter[] =>
  uris
    .map((uri) => ({ uri, name: stripPdf(nameFromUri(uri)) }))
    .sort((a, b) => naturalCompare(a.name, b.name));

const build = (uri: string, title: string, pdfs: string[], sourceUri: string): Manhwa => ({
  id: uri,
  title,
  uri,
  sourceUri,
  chapters: toChapters(pdfs),
});

const list = (uri: string) => SAF.readDirectoryAsync(uri).catch(() => [] as string[]);

/**
 * A manhwa is a directory that directly contains PDFs (one PDF per chapter).
 * Scans the chosen folder plus its immediate subfolders:
 *  - subfolders with PDFs           -> one manhwa each ("X - chapters" is shown as "X")
 *  - no such subfolders, root PDFs  -> the root itself is one manhwa
 *  - PDFs next to such subfolders   -> single-PDF manhwa, unless a subfolder has the same title
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

  if (result.length === 0) {
    return rootPdfs.length ? [build(root.uri, cleanTitle(root.name), rootPdfs, root.uri)] : [];
  }

  const taken = new Set(result.map((m) => m.title.toLowerCase()));
  for (const pdf of rootPdfs) {
    const title = cleanTitle(stripPdf(nameFromUri(pdf)));
    if (!taken.has(title.toLowerCase())) result.push(build(pdf, title, [pdf], root.uri));
  }
  return result;
}
