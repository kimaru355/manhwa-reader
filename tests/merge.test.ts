import assert from 'node:assert/strict';
import { test } from 'node:test';

import { threeWay } from '../src/lib/merge.ts';

type Item = { v: number };
const m = (o: Record<string, number>) => new Map(Object.entries(o).map(([k, v]) => [k, { v }] as [string, Item]));
const newer = (l: Item, r: Item): 'local' | 'remote' | 'same' => (l.v === r.v ? 'same' : l.v > r.v ? 'local' : 'remote');
const versions = (base: Record<string, number>) => ({ version: (x: Item) => x.v, baseVersion: new Map(Object.entries(base)) });

test('first sync combines both sides and deletes nothing', () => {
  const p = threeWay(m({ a: 1 }), m({ b: 1 }), new Set(), newer);
  assert.deepEqual(p.toRemote, [{ v: 1 }]);
  assert.deepEqual(p.toLocal, [{ v: 1 }]);
  assert.deepEqual(p.deleteLocal, []);
  assert.deepEqual(p.deleteRemote, []);
  assert.deepEqual(p.result.sort(), ['a', 'b']);
});

test('a key missing on one side after a sync is a deletion', () => {
  const p = threeWay(m({ a: 1 }), m({ b: 1 }), new Set(['a', 'b']), newer);
  assert.deepEqual(p.deleteLocal, ['a']);
  assert.deepEqual(p.deleteRemote, ['b']);
  assert.deepEqual(p.result, []);
});

test('conflicts go to the newer side', () => {
  const p = threeWay(m({ a: 2, b: 1, c: 5 }), m({ a: 1, b: 3, c: 5 }), new Set(['a', 'b', 'c']), newer);
  assert.deepEqual(p.toRemote, [{ v: 2 }]);
  assert.deepEqual(p.toLocal, [{ v: 3 }]);
  assert.deepEqual(p.result, ['a', 'b', 'c']);
});

test('an edit made after the last sync wins over a delete on the other side', () => {
  // "a" was deleted here but edited (v 1 -> 2) on the server; "b" was deleted on the server but edited here.
  const p = threeWay(m({ b: 4 }), m({ a: 2 }), new Set(['a', 'b']), newer, versions({ a: 1, b: 3 }));
  assert.deepEqual(p.deleteRemote, []);
  assert.deepEqual(p.deleteLocal, []);
  assert.deepEqual(p.toLocal, [{ v: 2 }]);
  assert.deepEqual(p.toRemote, [{ v: 4 }]);
  assert.deepEqual(p.result.sort(), ['a', 'b']);
});

test('an unedited item is still deleted when versions are tracked', () => {
  const p = threeWay(m({}), m({ a: 1 }), new Set(['a']), newer, versions({ a: 1 }));
  assert.deepEqual(p.deleteRemote, ['a']);
});

test('without a recorded version (older base) a deletion behaves as before', () => {
  const p = threeWay(m({}), m({ a: 9 }), new Set(['a']), newer, versions({}));
  assert.deepEqual(p.deleteRemote, ['a']);
});

test('an item the server would refuse stays here and is never recorded as synced', () => {
  const canSend = (x: Item) => x.v < 100;
  // First sync: "big" is not uploaded and not part of the base.
  let p = threeWay(m({ ok: 1, big: 100 }), m({}), new Set(), newer, undefined, canSend);
  assert.deepEqual(p.toRemote, [{ v: 1 }]);
  assert.deepEqual(p.result, ['ok']);
  // Next sync, with that base: it is still here, and still not deleted or uploaded.
  p = threeWay(m({ ok: 1, big: 100 }), m({ ok: 1 }), new Set(p.result), newer, undefined, canSend);
  assert.deepEqual(p.deleteLocal, []);
  assert.deepEqual(p.toRemote, []);
  assert.deepEqual(p.result, ['ok']);
});

test('an edit the server would refuse is not uploaded, and the item is kept on both sides', () => {
  const p = threeWay(m({ a: 100 }), m({ a: 1 }), new Set(['a']), newer, versions({ a: 1 }), (x) => x.v < 100);
  assert.deepEqual(p.toRemote, []);
  assert.deepEqual(p.toLocal, []);
  assert.deepEqual(p.deleteLocal, []);
  assert.deepEqual(p.deleteRemote, []);
  assert.deepEqual(p.result, ['a']);
});
