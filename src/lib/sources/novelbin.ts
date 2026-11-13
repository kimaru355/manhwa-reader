import { FriendlyError } from '../errors';
import type { Chapter, Series } from '../types';
import { decodeHtml, getText } from './http';
import type { Source } from './types';

const SITE = 'https://novelbin.me';

function parseList(html: string): Series[] {
  const out: Series[] = [];
  const re =
    /<img src="([^"]*)"[^>]*class="cover[^"]*"[\s\S]*?<h3 class="novel-title"><a href="https:\/\/novelbin\.me\/novel-book\/([^"/]+)"[^>]*>([^<]+)<\/a>/g;
  for (const m of html.matchAll(re)) {
    out.push({
      key: `novelbin:${m[2]}`,
      source: 'novelbin',
      id: m[2],
      title: decodeHtml(m[3]),
      cover: m[1] || undefined,
      category: 'novel',
    });
  }
  return out;
}

export const novelbin: Source = {
  id: 'novelbin',
  name: 'NovelBin',
  imageHeaders: {},
  kind: 'text',

  async browse({ page, query }) {
    const q = query?.trim();
    const url = q
      ? `${SITE}/search?keyword=${encodeURIComponent(q)}&page=${page + 1}`
      : `${SITE}/sort/novelbin-popular?page=${page + 1}`;
    const html = await getText(url);
    return { items: parseList(html), hasMore: /rel="next"/.test(html) };
  },

  async chapters(series) {
    const html = await getText(`${SITE}/ajax/chapter-archive?novelId=${encodeURIComponent(series.id)}`);
    const out: Chapter[] = [];
    for (const m of html.matchAll(/data-chapter-id="([^"]+)"[\s\S]*?title="([^"]*)"/g)) {
      out.push({ id: m[1], name: decodeHtml(m[2]) });
    }
    return out;
  },

  async pages() {
    return [];
  },

  async text(series, chapter) {
    const html = await getText(`${SITE}/novel-book/${series.id}/${chapter.id}`);
    const start = html.indexOf('id="chr-content"');
    if (start < 0) throw new FriendlyError('Chapter text not found.');
    const end = html.indexOf('<hr class="chr-end">', start);
    const body = html.slice(start, end > 0 ? end : undefined);
    const paras = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)]
      .map((m) => decodeHtml(m[1].replace(/<[^>]+>/g, '')))
      .filter(Boolean);
    if (!paras.length) throw new FriendlyError('Chapter text not found.');
    return paras;
  },
};
