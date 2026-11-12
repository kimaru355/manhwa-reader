import type { Chapter, Series } from '../types';
import { decodeHtml, getText } from './http';
import type { Source } from './types';

const SITE = 'https://novelfull.com';

const slugOf = (href: string) => href.replace(/^\/+/, '').replace(/\.html.*$/, '');

/** Cards on a listing page: cover, title and link. */
function parseList(html: string): Series[] {
  const out: Series[] = [];
  const re = /<img src="([^"]*)" class="cover"[\s\S]*?<h3 class="truyen-title">[\s\S]*?<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const id = slugOf(m[2]);
    if (!id || id.includes('/')) continue;
    out.push({
      key: `novelfull:${id}`,
      source: 'novelfull',
      id,
      title: decodeHtml(m[3]),
      cover: m[1] ? (m[1].startsWith('http') ? m[1] : `${SITE}${m[1]}`) : undefined,
      category: 'novel',
    });
  }
  return out;
}

function parseChapters(html: string): Chapter[] {
  const out: Chapter[] = [];
  const re = /<a href="\/[^/"]+\/([^"]+?)\.html" title="([^"]*)"><span class="chapter-text">/g;
  for (let m = re.exec(html); m; m = re.exec(html)) out.push({ id: m[1], name: decodeHtml(m[2]) });
  return out;
}

export const novelfull: Source = {
  id: 'novelfull',
  name: 'NovelFull',
  imageHeaders: {},
  kind: 'text',

  async browse({ page, query }) {
    const q = query?.trim();
    const url = q
      ? `${SITE}/search?keyword=${encodeURIComponent(q)}&page=${page + 1}`
      : `${SITE}/most-popular?page=${page + 1}`;
    const html = await getText(url);
    return { items: parseList(html), hasMore: /<li class="next">\s*<a /.test(html) };
  },

  async chapters(series) {
    const base = `${SITE}/${series.id}.html`;
    const first = await getText(base);
    const last = Math.max(1, ...[...first.matchAll(/[?&]page=(\d+)"/g)].map((m) => Number(m[1])));
    const pages: string[] = [first];
    // The list is split into pages of 50; the rest are fetched a few at a time.
    for (let from = 2; from <= last; from += 4) {
      const batch = Array.from({ length: Math.min(4, last - from + 1) }, (_, k) => getText(`${base}?page=${from + k}`));
      pages.push(...(await Promise.all(batch)));
    }
    const seen = new Set<string>();
    return pages
      .flatMap(parseChapters)
      .filter((c) => !seen.has(c.id) && !!seen.add(c.id));
  },

  async pages() {
    return [];
  },

  async text(series, chapter) {
    const html = await getText(`${SITE}/${series.id}/${chapter.id}.html`);
    const start = html.indexOf('id="chapter-content"');
    if (start < 0) throw new Error('Chapter text not found');
    const end = html.indexOf('<hr class="chapter-end">', start);
    const body = html.slice(start, end > 0 ? end : undefined);
    const paras = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)]
      .map((m) => decodeHtml(m[1].replace(/<[^>]+>/g, '')))
      .filter(Boolean);
    if (!paras.length) throw new Error('Chapter text not found');
    return paras;
  },
};
