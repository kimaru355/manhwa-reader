import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeSnapshot } from '../src/lib/snapshotMerge.ts';
import type { Snapshot } from '../src/lib/types.ts';

const series = (id: string) => ({ key: `mangadex:${id}`, source: 'mangadex' as const, id, title: id, category: 'manga' as const });
const snap = (o: Partial<Snapshot>): Snapshot => ({
  app: 'manhwa-reader',
  version: 2,
  savedAt: 1,
  favorites: [],
  wishlist: [],
  recents: [],
  bookmarks: [],
  ...o,
});

test('favorites and wishlist keep everything here and add what is new', () => {
  const m = mergeSnapshot(
    snap({ favorites: [series('a'), series('b')], wishlist: [series('x')] }),
    snap({ favorites: [series('b'), series('c')], wishlist: [] }),
  );
  assert.deepEqual(m.favorites.map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(m.wishlist.map((s) => s.id), ['x']);
});

test('history keeps the most recent entry per title, newest first', () => {
  const r = (id: string, ts: number, page: number) => ({ series: series(id), chapterId: 'c', chapterName: 'C', page, total: 9, ts });
  const m = mergeSnapshot(snap({ recents: [r('a', 5, 1), r('b', 3, 1)] }), snap({ recents: [r('a', 9, 7), r('c', 1, 1)] }));
  assert.deepEqual(
    m.recents.map((x) => `${x.series.id}:${x.page}`),
    ['a:7', 'b:1', 'c:1'],
  );
});

test('bookmarks keep the more recently edited copy', () => {
  const b = (id: string, note: string, updatedAt: number) => ({ id, seriesKey: 'k', chapterId: 'c', chapterName: 'C', page: 1, note, ts: 1, updatedAt });
  const m = mergeSnapshot(snap({ bookmarks: [b('1', 'mine', 5), b('2', 'only mine', 1)] }), snap({ bookmarks: [b('1', 'theirs', 2), b('3', 'only theirs', 1)] }));
  const notes = Object.fromEntries(m.bookmarks.map((x) => [x.id, x.note]));
  assert.deepEqual(notes, { '1': 'mine', '2': 'only mine', '3': 'only theirs' });
});

test('categories with the same name become one, holding the titles of both', () => {
  const m = mergeSnapshot(
    snap({
      categories: {
        favorites: { list: [{ id: 'r1', name: 'Romance' }], items: { 'mangadex:a': ['r1'] } },
        wishlist: { list: [], items: {} },
      },
    }),
    snap({
      categories: {
        favorites: { list: [{ id: 'r2', name: 'romance' }, { id: 'f2', name: 'Finished' }], items: { 'mangadex:b': ['r2', 'f2'] } },
        wishlist: { list: [{ id: 'w', name: 'Next' }], items: {} },
      },
    }),
  );
  assert.deepEqual(m.categories!.favorites.list, [
    { id: 'r1', name: 'Romance' },
    { id: 'f2', name: 'Finished' },
  ]);
  assert.deepEqual(m.categories!.favorites.items, { 'mangadex:a': ['r1'], 'mangadex:b': ['r1', 'f2'] });
  assert.deepEqual(m.categories!.wishlist.list, [{ id: 'w', name: 'Next' }]);
});

test('a file without categories leaves the current ones as they are', () => {
  const cats = { favorites: { list: [{ id: 'r', name: 'R' }], items: {} }, wishlist: { list: [], items: {} } };
  assert.equal(mergeSnapshot(snap({ categories: cats }), snap({})).categories, cats);
});
