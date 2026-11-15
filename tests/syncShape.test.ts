import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sendableBookmark, sendableSeries, toServerBookmark, toServerSeries } from '../src/lib/syncShape.ts';
import type { Bookmark, Series } from '../src/lib/types.ts';

const series: Series = { key: 'mangadex:1', source: 'mangadex', id: '1', title: 'One', category: 'manga' };
const mark: Bookmark = { id: 'b1', seriesKey: 'mangadex:1', chapterId: 'c1', chapterName: 'Ch. 1', page: 3, note: '', ts: 1000 };

test('an ordinary title and bookmark can be sent', () => {
  assert.equal(sendableSeries(series), true);
  assert.equal(sendableSeries({ ...series, cover: 'https://x/y.jpg', url: 'https://x' }), true);
  assert.equal(sendableBookmark(mark), true);
  assert.equal(sendableBookmark({ ...mark, updatedAt: 2000 }), true);
});

test('titles the server would refuse are held back', () => {
  assert.equal(sendableSeries({ ...series, id: 'x'.repeat(201) }), false);
  assert.equal(sendableSeries({ ...series, key: 'k'.repeat(301) }), false);
  assert.equal(sendableSeries({ ...series, title: '' }), false);
  assert.equal(sendableSeries({ ...series, cover: 'c'.repeat(2001) }), false);
  assert.equal(sendableSeries({ ...series, source: 'somewhere' as Series['source'] }), false);
  assert.equal(sendableSeries({ ...series, category: 'other' as Series['category'] }), false);
  assert.equal(sendableSeries({ ...series, title: 5 as unknown as string }), false);
  assert.equal(sendableSeries(null as unknown as Series), false);
});

test('bookmarks the server would refuse are held back', () => {
  assert.equal(sendableBookmark({ ...mark, page: 0 }), false);
  assert.equal(sendableBookmark({ ...mark, page: 1.5 }), false);
  assert.equal(sendableBookmark({ ...mark, id: 'i'.repeat(65) }), false);
  assert.equal(sendableBookmark({ ...mark, ts: -1 }), false);
  assert.equal(sendableBookmark({ ...mark, note: undefined as unknown as string }), false);
  assert.equal(sendableBookmark(undefined as unknown as Bookmark), false);
});

test('only the fields the server knows are sent, cut to its limits', () => {
  const sent = toServerSeries({ ...series, title: 't'.repeat(400), extra: 1 } as Series);
  assert.deepEqual(Object.keys(sent).sort(), ['category', 'id', 'key', 'source', 'title']);
  assert.equal(sent.title.length, 300);
  const b = toServerBookmark({ ...mark, note: 'n'.repeat(250), chapterName: 'c'.repeat(350), extra: 1 } as Bookmark);
  assert.deepEqual(Object.keys(b).sort(), ['chapterId', 'chapterName', 'id', 'note', 'page', 'seriesKey', 'ts', 'updatedAt']);
  assert.equal(b.note.length, 200);
  assert.equal(b.chapterName.length, 300);
  assert.equal(b.updatedAt, 1000);
});
