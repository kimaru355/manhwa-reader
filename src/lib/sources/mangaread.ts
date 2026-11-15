import { FriendlyError } from '../errors';
import type { Chapter, Series } from '../types';
import { decodeHtml, getText } from './http';
import type { Source } from './types';

const SITE = 'https://www.mangaread.org';

/** Title cards on the browse and search pages (the same link + cover markup on both). */
function parseCards(html: string): Series[] {
  const out: Series[] = [];
  const seen = new Set<string>();
  const re =
    /<a href="https:\/\/www\.mangaread\.org\/manga\/([^/"]+)\/" title="([^"]*)">\s*<img[^>]*?(?:data-src|src)="([^"]+)"/g;
  for (const m of html.matchAll(re)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    // Thumbnails are resized copies ("…-110x150.jpg"); the original is a sharper cover.
    const cover = m[3].replace(/-\d+x\d+(\.\w+)$/, '$1');
    out.push({ key: `mangaread:${m[1]}`, source: 'mangaread', id: m[1], title: decodeHtml(m[2]), cover, category: 'manga' });
  }
  return out;
}

export const mangaread: Source = {
  id: 'mangaread',
  name: 'MangaRead',
  // Covers and pages load without extra headers.
  imageHeaders: {},

  async browse({ page, query }) {
    const q = query?.trim();
    const url = q
      ? `${SITE}/page/${page + 1}/?s=${encodeURIComponent(q)}&post_type=wp-manga`
      : `${SITE}/manga/page/${page + 1}/?m_orderby=views`;
    const html = await getText(url);
    const items = parseCards(html);
    return { items, hasMore: items.length > 0 && /class="(?:nextpostslink|next page-numbers)"|\/page\/\d+\//.test(html) };
  },

  async chapters(series) {
    const html = await getText(`${SITE}/manga/${encodeURIComponent(series.id)}/`);
    const out: Chapter[] = [];
    const seen = new Set<string>();
    const re = /<li class="wp-manga-chapter[^"]*">\s*<a href="https:\/\/www\.mangaread\.org\/manga\/[^/"]+\/([^/"]+)\/">\s*([^<]+?)\s*<\/a>/g;
    for (const m of html.matchAll(re)) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ id: m[1], name: decodeHtml(m[2]) });
    }
    return out.reverse();
  },

  async pages(series, chapter) {
    const html = await getText(`${SITE}/manga/${encodeURIComponent(series.id)}/${encodeURIComponent(chapter.id)}/`);
    const urls = [...html.matchAll(/<img[^>]*?(?:data-src|src)="\s*(https?:\/\/[^"\s]+)\s*"[^>]*class="wp-manga-chapter-img"/g)].map((m) =>
      decodeHtml(m[1]),
    );
    if (!urls.length) throw new FriendlyError('No pages were found for this chapter.');
    return urls;
  },
};
