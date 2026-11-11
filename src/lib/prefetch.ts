import { chapterDir, fetchPages, markDone, readDone } from './files';
import { getSource } from './sources';
import { FriendlyError } from './errors';
import type { Chapter, Series } from './types';

/** Chapters beyond the one being read that are loaded up front. */
export const AHEAD_INITIAL = 10;
/** More are loaded once this many (or fewer) are left. */
export const AHEAD_MIN = 5;
/** How many are added each time. */
export const AHEAD_STEP = 5;

/**
 * Makes sure every page of an online chapter is on disk (in the reading cache) and returns where.
 * A chapter that finished before is reused without touching the network.
 */
export async function loadOnlineChapter(
  series: Series,
  chapter: Chapter,
  onProgress?: (done: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<{ dir: string; names: string[] }> {
  const dir = chapterDir(series.key, chapter.id, false);
  const cached = await readDone(dir);
  if (cached) return { dir, names: cached };
  const source = getSource(series.source);
  if (!source) throw new FriendlyError('This title cannot be read in the app.');
  const urls = await source.pages(series, chapter);
  const names = await fetchPages(urls, dir, source.imageHeaders, onProgress, shouldStop);
  await markDone(dir, names);
  return { dir, names };
}
