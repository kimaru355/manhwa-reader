import type { Chapter, Series, SourceId } from '../types';

export type Page<T> = { items: T[]; hasMore: boolean };

export type Source = {
  id: SourceId;
  name: string;
  /** Headers needed to fetch images (some hosts reject requests without a Referer). */
  imageHeaders: Record<string, string>;
  browse: (opts: { page: number; query?: string }) => Promise<Page<Series>>;
  /** Oldest first. */
  chapters: (series: Series) => Promise<Chapter[]>;
  /** Image URLs in reading order. */
  pages: (series: Series, chapter: Chapter) => Promise<string[]>;
};
