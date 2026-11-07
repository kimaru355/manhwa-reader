export type Folder = {
  uri: string;
  name: string;
};

export type Chapter = {
  uri: string;
  name: string;
};

/** A folder holding one PDF per chapter. */
export type Manhwa = {
  id: string;
  title: string;
  /** Folder this manhwa was found in. */
  uri: string;
  /** Which user-added root folder it came from. */
  sourceUri: string;
  chapters: Chapter[];
};

/** A saved spot in a chapter, with an optional note ("peak fight"). */
export type Bookmark = {
  id: string;
  manhwaId: string;
  /** Chapters are matched by file so bookmarks survive chapters being added or reordered. */
  chapterUri: string;
  chapterName: string;
  page: number;
  note: string;
  ts: number;
};

export type Recent = {
  manhwaId: string;
  chapterIndex: number;
  page: number;
  total: number;
  ts: number;
};

/** Everything worth keeping across a reinstall. The scanned library is rebuilt from `folders`. */
export type Snapshot = {
  app: 'manhwa-reader';
  version: 1;
  savedAt: number;
  folders: Folder[];
  favorites: string[];
  wishlist: string[];
  recents: Recent[];
  bookmarks: Bookmark[];
};
