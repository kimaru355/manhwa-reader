import { FriendlyError } from '../errors';
import type { Chapter, Series } from '../types';
import { decodeHtml, getJson, getText } from './http';
import type { Source } from './types';

const SITE = 'https://m.webtoons.com';

type EpisodesResponse = {
  result: { episodeList: { episodeNo: number; episodeTitle: string; viewerLink: string }[]; nextCursor?: number };
};

let originals: Promise<Series[]> | null = null;

/** The originals page lists every current title in one go; it also serves as the search pool. */
function loadOriginals(): Promise<Series[]> {
  originals ??= getText(`${SITE}/en/originals`)
    .then((html) => {
      const out: Series[] = [];
      const seen = new Set<string>();
      const re =
        /<a href="[^"]*\/list\?title_no=(\d+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[\s\S]*?<strong class="title">([^<]*)<\/strong>/g;
      for (const m of html.matchAll(re)) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        out.push({
          key: `webtoons:${m[1]}`,
          source: 'webtoons',
          id: m[1],
          title: decodeHtml(m[3]),
          cover: m[2],
          category: 'manhwa',
        });
      }
      return out;
    })
    .catch((e) => {
      originals = null;
      throw e;
    });
  return originals;
}

export const webtoons: Source = {
  id: 'webtoons',
  name: 'WEBTOON',
  imageHeaders: { Referer: 'https://www.webtoons.com/' },

  async browse({ page, query }) {
    if (page > 0) return { items: [], hasMore: false };
    const all = await loadOriginals();
    const q = query?.trim().toLowerCase();
    return { items: q ? all.filter((s) => s.title.toLowerCase().includes(q)) : all, hasMore: false };
  },

  async chapters(series) {
    const out: Chapter[] = [];
    let cursor: number | undefined;
    for (let i = 0; i < 50; i++) {
      const res = await getJson<EpisodesResponse>(
        `${SITE}/api/v1/webtoon/${series.id}/episodes?pageSize=100&language=en${cursor ? `&cursor=${cursor}` : ''}`,
      );
      for (const e of res.result.episodeList) {
        out.push({ id: String(e.episodeNo), name: decodeHtml(e.episodeTitle), url: `${SITE}${e.viewerLink}` });
      }
      cursor = res.result.nextCursor;
      if (!cursor) break;
    }
    return out.sort((a, b) => Number(a.id) - Number(b.id));
  },

  async pages(_series, chapter) {
    if (!chapter.url) throw new FriendlyError("This chapter can't be opened.");
    const html = await getText(chapter.url);
    const block = html.match(/var imageList = \[([\s\S]*?)\];/)?.[1];
    const urls = block ? [...block.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
    if (!urls.length) throw new FriendlyError('This episode is locked or has no free pages.');
    return urls;
  },
};
