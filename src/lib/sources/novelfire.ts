import { FriendlyError } from '../errors';
import type { Chapter, Series } from '../types';
import { mapLimit } from '../util';
import { getText } from './http';
import { NOVELFIRE, nfChapter, nfChapterList, nfChapterPages, nfHasNext, nfNovels, type Listed } from './novelParse';
import type { Source } from './types';

const toSeries = (n: Listed): Series => ({
  key: `novelfire:${n.id}`,
  source: 'novelfire',
  id: n.id,
  title: n.title,
  cover: n.cover,
  category: 'novel',
});

/** Novel Fire: a large library of translated web and light novels, much like NovelBin's. */
export const novelfire: Source = {
  id: 'novelfire',
  name: 'Novel Fire',
  imageHeaders: {},
  kind: 'text',

  async browse({ page, query }) {
    const q = query?.trim();
    const url = q
      ? `${NOVELFIRE}/search?keyword=${encodeURIComponent(q)}&page=${page + 1}`
      : `${NOVELFIRE}/genre-all/sort-popular/status-all/all-novel?page=${page + 1}`;
    const html = await getText(url);
    return { items: nfNovels(html).map(toSeries), hasMore: nfHasNext(html) };
  },

  async chapters(series) {
    // 100 chapters a page; the first page says how many pages there are.
    const base = `${NOVELFIRE}/book/${encodeURIComponent(series.id)}/chapters`;
    const first = await getText(base);
    const pages = nfChapterPages(first);
    const rest = await mapLimit(
      Array.from({ length: pages - 1 }, (_, i) => i + 2),
      4,
      (p) => getText(`${base}?page=${p}`),
    );
    const seen = new Set<string>();
    const out: Chapter[] = [];
    for (const html of [first, ...rest]) {
      for (const c of nfChapterList(html, series.id)) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.push(c);
      }
    }
    return out;
  },

  async pages() {
    return [];
  },

  async text(series, chapter) {
    const html = await getText(`${NOVELFIRE}/book/${encodeURIComponent(series.id)}/${encodeURIComponent(chapter.id)}`);
    const paras = nfChapter(html);
    if (!paras.length) throw new FriendlyError('Chapter text not found.');
    return paras;
  },
};
