import type { Chapter, Series, SourceId } from '../types';

export type Page<T> = { items: T[]; hasMore: boolean };

export type Source = {
  id: SourceId;
  name: string;
  /** `text` sources are novels: chapters are read (and downloaded) as text, not images. */
  kind?: 'text';
  /** Headers needed to fetch images (some hosts reject requests without a Referer). */
  imageHeaders: Record<string, string>;
  browse: (opts: { page: number; query?: string }) => Promise<Page<Series>>;
  /** Oldest first. */
  chapters: (series: Series) => Promise<Chapter[]>;
  /** Image URLs in reading order. */
  pages: (series: Series, chapter: Chapter) => Promise<string[]>;
  /** Paragraphs of a chapter (text sources only). */
  text?: (series: Series, chapter: Chapter) => Promise<string[]>;
};
