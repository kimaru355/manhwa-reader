import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanBookmark, cleanList, cleanRecent, cleanSeries } from '../src/lib/snapshotShape.ts';

const series = { key: 'mangadex:1', source: 'mangadex', id: '1', title: 'One', category: 'manga' };

test('a well-formed title is kept, without fields the app does not know', () => {
  assert.deepEqual(cleanSeries({ ...series, cover: 'https://x/c.jpg', junk: 1 }), { ...series, cover: 'https://x/c.jpg' });
});

test('things that are not titles are dropped', () => {
  for (const bad of [null, 5, 'x', [], {}, { ...series, key: '' }, { ...series, title: 7 }, { ...series, id: undefined }]) {
    assert.equal(cleanSeries(bad), null);
  }
});

test('history entries need a title and a chapter; odd numbers are repaired', () => {
  assert.equal(cleanRecent({ series: {}, chapterId: 'c' }), null);
  assert.equal(cleanRecent({ series }), null);
  assert.deepEqual(cleanRecent({ series, chapterId: 'c', page: 'x', total: -3 }), {
    series,
    chapterId: 'c',
    chapterName: '',
    page: 1,
    total: 1,
    ts: 0,
  });
});

test('bookmarks need an id, a title, a chapter and a page', () => {
  assert.equal(cleanBookmark({ id: 'b', seriesKey: 'k', chapterId: 'c', page: 0 }), null);
  assert.equal(cleanBookmark({ id: 'b', seriesKey: 'k', page: 2 }), null);
  assert.deepEqual(cleanBookmark({ id: 'b', seriesKey: 'k', chapterId: 'c', page: 2.7, note: 5, ts: 10 }), {
    id: 'b',
    seriesKey: 'k',
    chapterId: 'c',
    chapterName: '',
    page: 2,
    note: '',
    ts: 10,
  });
});

test('a list keeps the usable entries once each, in order', () => {
  const list = cleanList([series, null, { ...series, title: 'Again' }, { ...series, key: 'mangadex:2', id: '2' }, 'x'], cleanSeries, (s) => s.key);
  assert.deepEqual(list.map((s) => s.key), ['mangadex:1', 'mangadex:2']);
  assert.deepEqual(cleanList('not a list', cleanSeries, (s) => s.key), []);
});
