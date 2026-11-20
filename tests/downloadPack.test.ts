import assert from 'node:assert/strict';
import { test } from 'node:test';

import { packSeries, unpackSeries } from '../src/lib/downloadPack.ts';
import type { DownloadedSeries } from '../src/lib/types.ts';

const base =
  'content://com.android.externalstorage.documents/tree/primary%3ADownload%2Fmanhwa-reader/document/primary%3ADownload%2Fmanhwa-reader%2Fdownloads%2FSolo%20Leveling%20-%20abc%2FChapter%201%20-%20def%2F';
const files = Array.from({ length: 60 }, (_, i) => `${String(i + 1).padStart(3, '0')}.jpg`);

const item: DownloadedSeries = {
  series: { key: 'mangapill:1', source: 'mangapill', id: '1', title: 'Solo Leveling', category: 'manhwa' },
  cover: `${base}cover.jpg`,
  dir: base,
  chapters: [
    { id: 'c1', name: 'Chapter 1', files, ts: 1, dir: base, uris: files.map((f) => base + f) },
    { id: 'c2', name: 'Chapter 2', files: ['001.jpg'], ts: 2, dir: base, uris: [`${base}001.jpg`] },
    { id: 'c3', name: 'Chapter 3', files: ['001.jpg', '002.png'], ts: 3 },
  ],
};

test('a packed title reads back the same', () => {
  const back = unpackSeries(JSON.parse(JSON.stringify(packSeries(item))));
  assert.deepEqual(back, item);
});

test('packing keeps each page address short', () => {
  const packed = JSON.stringify(packSeries(item));
  const plain = JSON.stringify(item);
  assert.ok(packed.length < plain.length / 5, `${packed.length} vs ${plain.length}`);
});

test('titles written before packing still read', () => {
  assert.deepEqual(unpackSeries(JSON.parse(JSON.stringify(item))), item);
});

test('anything else is rejected, and broken chapters are left out', () => {
  assert.equal(unpackSeries(null), null);
  assert.equal(unpackSeries({ chapters: [] }), null);
  const back = unpackSeries({ ...item, chapters: [{ id: 'x' }, item.chapters[2]] });
  assert.deepEqual(back?.chapters, [item.chapters[2]]);
});
