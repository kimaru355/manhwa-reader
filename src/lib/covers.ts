/**
 * NovelBin's image host (images.novelbin.me / images.novelbin.com) no longer exists, so its covers never
 * load. novelfire.net keeps the same covers under the same names (the novel's id), so NovelBin covers are
 * taken from there. A cover from anywhere else (for example set in the recommendations file) is kept.
 * Pure, so it is covered by the node tests.
 */
const DEAD_HOST = /^https?:\/\/images\.novelbin\.[a-z]+\//i;

export const novelfireCover = (id: string) => `https://novelfire.net/server-1/${encodeURIComponent(id)}.jpg`;

export function coverFor(s: { source: string; id: string; cover?: string }): string | undefined {
  if (s.source === 'novelbin' && (!s.cover || DEAD_HOST.test(s.cover))) return novelfireCover(s.id);
  return s.cover;
}
