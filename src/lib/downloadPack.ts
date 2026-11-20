import type { DownloadedChapter, DownloadedSeries } from './types';

/**
 * How a downloaded title is written to disk. A chapter in the download folder has one long address per page
 * (often 200+ characters, nearly all of it the same), so the shared start is kept once per chapter (`ub`) and
 * only the part after it per page (`ut`). This keeps a title with hundreds of chapters to a small file.
 */
type PackedChapter = Omit<DownloadedChapter, 'uris'> & { ub?: string; ut?: string[]; uris?: string[] };
export type PackedSeries = Omit<DownloadedSeries, 'chapters'> & { chapters: PackedChapter[] };

function sharedStart(list: string[]) {
  let end = list[0].length;
  for (const s of list) {
    let i = 0;
    while (i < end && i < s.length && s[i] === list[0][i]) i++;
    end = i;
  }
  return list[0].slice(0, end);
}

export function packSeries(item: DownloadedSeries): PackedSeries {
  return {
    ...item,
    chapters: item.chapters.map(({ uris, ...c }) => {
      if (!uris?.length) return c;
      const ub = sharedStart(uris);
      return { ...c, ub, ut: uris.map((u) => u.slice(ub.length)) };
    }),
  };
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** Reads a title written by packSeries (or an older unpacked one). Null if it isn't one. */
export function unpackSeries(v: unknown): DownloadedSeries | null {
  const d = v as PackedSeries | null;
  if (!d || typeof d !== 'object' || typeof d.series?.key !== 'string' || !Array.isArray(d.chapters)) return null;
  const chapters: DownloadedChapter[] = [];
  for (const raw of d.chapters) {
    if (!raw || typeof raw.id !== 'string' || !isStrings(raw.files)) continue;
    const { ub, ut, uris, ...c } = raw;
    if (typeof ub === 'string' && isStrings(ut)) chapters.push({ ...c, uris: ut.map((t) => ub + t) });
    else if (isStrings(uris)) chapters.push({ ...c, uris });
    else chapters.push(c);
  }
  return { ...d, chapters };
}
