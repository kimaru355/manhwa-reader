import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nextBlock, parseRange, sliceRange } from '../src/lib/chapterRange.ts';
import { coverFor, novelfireCover } from '../src/lib/covers.ts';

test('a typed range is read as 1-based and inclusive', () => {
  assert.deepEqual(parseRange('1', '100', 500), { ok: true, start: 1, end: 100 });
  assert.deepEqual(parseRange(' 101 ', '200', 500), { ok: true, start: 101, end: 200 });
});

test('empty ends mean the first and the last chapter', () => {
  assert.deepEqual(parseRange('', '80', 500), { ok: true, start: 1, end: 80 });
  assert.deepEqual(parseRange('450', '', 500), { ok: true, start: 450, end: 500 });
  assert.deepEqual(parseRange('', '', 3), { ok: true, start: 1, end: 3 });
});

test('reversed, zero and too-large values are made sensible', () => {
  assert.deepEqual(parseRange('200', '101', 500), { ok: true, start: 101, end: 200 });
  assert.deepEqual(parseRange('0', '10', 500), { ok: true, start: 1, end: 10 });
  assert.deepEqual(parseRange('480', '9999', 500), { ok: true, start: 480, end: 500 });
});

test('bad input says what is wrong', () => {
  assert.equal(parseRange('abc', '10', 50).ok, false);
  assert.equal(parseRange('1.5', '10', 50).ok, false);
  assert.equal(parseRange('-3', '10', 50).ok, false);
  const r = parseRange('60', '70', 50);
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /only 50 chapters/);
  assert.equal(parseRange('1', '2', 0).ok, false);
});

test('slices and blocks pick the right chapters', () => {
  const list = Array.from({ length: 10 }, (_, i) => i + 1);
  assert.deepEqual(sliceRange(list, { start: 3, end: 5 }), [3, 4, 5]);
  assert.deepEqual(nextBlock(8, 50, 10), { start: 8, end: 10 });
  assert.deepEqual(nextBlock(0, 5, 10), { start: 1, end: 5 });
});

test('NovelBin covers come from novelfire.net, other covers are kept', () => {
  assert.equal(
    coverFor({ source: 'novelbin', id: 'shadow-slave', cover: 'https://images.novelbin.me/novel_80_113/shadow-slave.jpg' }),
    'https://novelfire.net/server-1/shadow-slave.jpg',
  );
  assert.equal(coverFor({ source: 'novelbin', id: 'a-b' }), novelfireCover('a-b'));
  assert.equal(coverFor({ source: 'novelbin', id: 'x', cover: 'https://example.com/x.png' }), 'https://example.com/x.png');
  assert.equal(coverFor({ source: 'webtoons', id: 'x', cover: 'https://images.novelbin.me/x.jpg' }), 'https://images.novelbin.me/x.jpg');
  assert.equal(coverFor({ source: 'webtoons', id: 'x' }), undefined);
});
