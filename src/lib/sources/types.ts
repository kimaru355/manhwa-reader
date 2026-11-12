import type { Category, Chapter, Series, SourceId } from '../types';

export type Page<T> = { items: T[]; hasMore: boolean };

export type Source = {
  id: SourceId;
  name: string;
  /** `text` sources are novels: chapters are read as text, not images, and cannot be downloaded. */
  kind?: 'text';
  /** Headers needed to fetch images (some hosts reject requests without a Referer). */
  imageHeaders: Record<string, string>;
  browse: (opts: { page: number; query?: string; category?: Category }) => Promise<Page<Series>>;
  /** Oldest first. */
  chapters: (series: Series) => Promise<Chapter[]>;
  /** Image URLs in reading order. */
  pages: (series: Series, chapter: Chapter) => Promise<string[]>;
  /** Paragraphs of a chapter (text sources only). */
  text?: (series: Series, chapter: Chapter) => Promise<string[]>;
};
