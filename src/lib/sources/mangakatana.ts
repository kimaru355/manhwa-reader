import { FriendlyError } from '../errors';
import type { Chapter, Series } from '../types';
import { decodeHtml, getText } from './http';
import type { Source } from './types';

const SITE = 'https://mangakatana.com';

/**
 * MangaKatana answers a request that comes too soon after the previous one with an empty page (no error). Such a
 * page is fetched again after a short pause.
 */
async function getPage(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const html = await getText(url);
    if (html.length > 500 || attempt >= 3) return html;
    await new Promise((r) => setTimeout(r, 1200));
  }
}

/** The main list of title cards (search results, or the latest updates on the home page). Sidebars are left out. */
function parseList(html: string): Series[] {
  let main = html.slice(Math.max(html.indexOf('id="book_list"'), 0));
  const end = main.indexOf('class="uk-pagination');
  if (end > 0) main = main.slice(0, end);
  const out: Series[] = [];
  const seen = new Set<string>();
  const re =
    /<div class="item"[^>]*>[\s\S]*?<a href="https:\/\/mangakatana\.com\/manga\/([^"/]+)">[\s\S]*?<img src="([^"]+)"[\s\S]*?<h3 class="title">\s*<a href="[^"]+"[^>]*>([^<]*)<\/a>/g;
  for (const m of main.matchAll(re)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ key: `mangakatana:${m[1]}`, source: 'mangakatana', id: m[1], title: decodeHtml(m[3]), cover: m[2], category: 'manga' });
  }
  return out;
}

/** A search with exactly one match lands on that title's own page instead of a list. */
function parseSeriesPage(html: string): Series[] {
  const url = html.match(/<meta property="og:url" content="https:\/\/mangakatana\.com\/manga\/([^"/]+)"/)?.[1];
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  if (!url || !title) return [];
  const cover = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  return [{ key: `mangakatana:${url}`, source: 'mangakatana', id: url, title: decodeHtml(title), cover, category: 'manga' }];
}

export const mangakatana: Source = {
  id: 'mangakatana',
  name: 'MangaKatana',
  // Pages and covers load without extra headers.
  imageHeaders: {},

  async browse({ page, query }) {
    const q = query?.trim();
    // The site has no "most popular" list; its home page lists the latest updated titles.
    // The first page has to be "/": "/page/1" answers an empty page for searches.
    const base = page === 0 ? `${SITE}/` : `${SITE}/page/${page + 1}`;
    const html = await getPage(q ? `${base}?search=${encodeURIComponent(q)}&search_by=book_name` : base);
    const isSeries = html.includes('class="chapters"') && !html.includes('id="book_list"');
    if (isSeries) return { items: page === 0 ? parseSeriesPage(html) : [], hasMore: false };
    const items = parseList(html);
    return { items, hasMore: items.length > 0 && /class="next/.test(html) };
  },

  async chapters(series) {
    const html = await getPage(`${SITE}/manga/${encodeURIComponent(series.id)}`);
    let list = html.slice(Math.max(html.indexOf('class="chapters"'), 0));
    list = list.slice(0, Math.max(list.indexOf('</table>'), 0) || undefined);
    const out: Chapter[] = [];
    const seen = new Set<string>();
    for (const m of list.matchAll(/<div class="chapter">\s*<a href="https:\/\/mangakatana\.com\/manga\/[^"/]+\/([^"/]+)">([^<]*)<\/a>/g)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ id: m[1], name: decodeHtml(m[2]) });
    }
    // The page lists the newest first.
    return out.reverse();
  },

  async pages(series, chapter) {
    const html = await getPage(`${SITE}/manga/${encodeURIComponent(series.id)}/${encodeURIComponent(chapter.id)}`);
    // The pages are in a script array whose name changes; the chapter is the longest list of image links.
    let urls: string[] = [];
    for (const m of html.matchAll(/var\s+\w+\s*=\s*\[((?:\s*'https?:\/\/[^']+'\s*,?)+)\]/g)) {
      const list = [...m[1].matchAll(/'(https?:\/\/[^']+)'/g)].map((x) => x[1]);
      if (list.length > urls.length) urls = list;
    }
    if (!urls.length) throw new FriendlyError('No pages were found for this chapter.');
    return urls;
  },
};
