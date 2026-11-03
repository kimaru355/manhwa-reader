export type Folder = {
  uri: string;
  name: string;
};

export type Chapter = {
  uri: string;
  name: string;
};

export type Manhwa = {
  id: string;
  title: string;
  /** Folder (or single PDF) this manhwa was found in. */
  uri: string;
  /** Which user-added root folder it came from. */
  sourceUri: string;
  chapters: Chapter[];
};

export type Recent = {
  manhwaId: string;
  chapterIndex: number;
  page: number;
  total: number;
  ts: number;
};
