import { FriendlyError } from '../errors';
import type { Chapter, Series } from '../types';
import { decodeHtml, getText } from './http';
import type { Source } from './types';

const SITE = 'https://mangapill.com';

/** Title cards on the search and browse pages. Ids are MangaPill's number (the address redirects to the full one). */
function parseCards(html: string): Series[] {
  const out: Series[] = [];
  const seen = new Set<string>();
  const re =
    /<a href="\/manga\/(\d+)\/[^"]*" class="relative block">[\s\S]*?<img data-src="([^"]+)"[\s\S]*?<div class="mt-3 font-black[^"]*">([^<]*)<\/div>/g;
  for (const m of html.matchAll(re)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ key: `mangapill:${m[1]}`, source: 'mangapill', id: m[1], title: decodeHtml(m[3]), cover: m[2], category: 'manga' });
  }
  return out;
}

export const mangapill: Source = {
  id: 'mangapill',
  name: 'MangaPill',
  // Covers and pages are refused without MangaPill as the Referer.
  imageHeaders: { Referer: 'https://mangapill.com/' },

  async browse({ page, query }) {
    const q = query?.trim() ?? '';
    const html = await getText(
      `${SITE}/search?q=${encodeURIComponent(q)}&type=${q ? '' : 'manga'}&status=&page=${page + 1}`,
    );
    return { items: parseCards(html), hasMore: /class="btn btn-sm">\s*Next/.test(html) };
  },

  async chapters(series) {
    const html = await getText(`${SITE}/manga/${encodeURIComponent(series.id)}`);
    const out: Chapter[] = [];
    const seen = new Set<string>();
    for (const m of html.matchAll(/<a[^>]*href="\/chapters\/([^/"]+)\/[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/g)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ id: m[1], name: decodeHtml(m[2]) });
    }
    // The page lists the newest first.
    return out.reverse();
  },

  async pages(_series, chapter) {
    const html = await getText(`${SITE}/chapters/${encodeURIComponent(chapter.id)}`);
    const urls = [...html.matchAll(/<img class="js-page"[^>]*data-src="([^"]+)"/g)].map((m) => decodeHtml(m[1]));
    if (!urls.length) throw new FriendlyError('No pages were found for this chapter.');
    return urls;
  },
};
