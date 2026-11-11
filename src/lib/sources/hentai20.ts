import { FriendlyError } from '../errors';
import type { Chapter, Series } from '../types';
import { decodeHtml, getText } from './http';
import type { Source } from './types';

const SITE = 'https://hentai20.io';

export const hentai20: Source = {
  id: 'hentai20',
  name: 'Hentai20',
  imageHeaders: { Referer: `${SITE}/` },

  async browse({ page, query }) {
    const q = query?.trim();
    const url = q
      ? `${SITE}/page/${page + 1}/?s=${encodeURIComponent(q)}`
      : `${SITE}/manga/?page=${page + 1}&order=popular`;
    const html = await getText(url);
    const items: Series[] = [];
    const re =
      /<div class="bsx">[\s\S]*?<a href="https:\/\/hentai20\.io\/manga\/([^/"]+)\/" title="([^"]*)"[\s\S]*?<img[^>]*src="([^"]+)"/g;
    for (const m of html.matchAll(re)) {
      items.push({
        key: `hentai20:${m[1]}`,
        source: 'hentai20',
        id: m[1],
        title: decodeHtml(m[2]),
        cover: m[3],
        category: 'interesting',
      });
    }
    return { items, hasMore: items.length >= 20 };
  },

  async chapters(series) {
    const html = await getText(`${SITE}/manga/${series.id}/`);
    const list = html.split('id="chapterlist"')[1] ?? '';
    const out: Chapter[] = [];
    const re = /<a href="(https:\/\/hentai20\.io\/([^/"]+)\/)">\s*<span class="chapternum">([^<]*)<\/span>/g;
    for (const m of list.matchAll(re)) out.push({ id: m[2], name: decodeHtml(m[3]), url: m[1] });
    return out.reverse();
  },

  async pages(_series, chapter) {
    if (!chapter.url) throw new FriendlyError("This chapter can't be opened.");
    const html = await getText(chapter.url);
    const json = html.match(/ts_reader\.run\((\{[\s\S]*?\})\);/)?.[1];
    let images: string[] = [];
    try {
      images = json ? (JSON.parse(json).sources?.[0]?.images ?? []) : [];
    } catch {
      const raw = json?.match(/"images":\[([^\]]*)\]/)?.[1] ?? '';
      images = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1].replace(/\\\//g, '/'));
    }
    if (!images.length) throw new FriendlyError('No pages were found for this chapter.');
    return images;
  },
};
