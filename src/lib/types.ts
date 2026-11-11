export type Folder = {
  uri: string;
  name: string;
};

/** What a title is. Home/Discover tabs are built from this. */
export type Category = 'manga' | 'manhwa' | 'interesting' | 'novel';

/** Where chapters come from. `external` titles have no reader; they open their link in the browser. */
export type SourceId = 'mangadex' | 'webtoons' | 'hentai20' | 'external';

/** How strongly the author recommends a title. */
export type Tier = 'all-time' | 'interesting' | 'good' | 'trial';

/** A title as listed by a source. Small enough to store in favorites/history. */
export type Series = {
  /** `${source}:${id}` — unique across sources. */
  key: string;
  source: SourceId;
  id: string;
  title: string;
  cover?: string;
  category: Category;
  /** Page of the title on its site (used for `external` titles). */
  url?: string;
};

/** `id` is stable per source; `url` is whatever the source needs to fetch the pages. */
export type Chapter = {
  id: string;
  name: string;
  url?: string;
};

/** A saved spot in a chapter, with an optional note ("peak fight"). */
export type Bookmark = {
  id: string;
  seriesKey: string;
  chapterId: string;
  chapterName: string;
  page: number;
  note: string;
  ts: number;
  /** Last edit (ms); used to settle conflicts when syncing. Missing means `ts`. */
  updatedAt?: number;
};

/** A bookmark written by the author in the recommendations file. */
export type AuthorBookmark = {
  chapterId: string;
  chapterName?: string;
  page?: number;
  note?: string;
};

export type Recommendation = Omit<Series, 'key'> & {
  tier: Tier;
  /** Why the author recommends it. */
  note?: string;
  bookmarks?: AuthorBookmark[];
};

/** The remote recommendations file. */
export type RecsFile = {
  version: 1;
  updated?: string;
  /** Which sources to browse for each category (first one is the default). */
  sources?: Partial<Record<Category, { source: SourceId; name?: string }[]>>;
  recommendations: Recommendation[];
};

export type Recent = {
  series: Series;
  chapterId: string;
  chapterName: string;
  page: number;
  total: number;
  ts: number;
};

/** Everything worth keeping across a reinstall. Downloaded images stay on the device only. */
export type Snapshot = {
  app: 'manhwa-reader';
  version: 2;
  savedAt: number;
  favorites: Series[];
  wishlist: Series[];
  recents: Recent[];
  bookmarks: Bookmark[];
};

export type DownloadedChapter = Chapter & {
  /** File names inside the chapter's folder, in reading order. */
  files: string[];
  ts: number;
};

export type DownloadedSeries = {
  series: Series;
  /** Cover saved on the device so it shows offline. */
  cover?: string;
  chapters: DownloadedChapter[];
};

