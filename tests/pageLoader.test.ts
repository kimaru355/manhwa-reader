import assert from 'node:assert/strict';
import { test } from 'node:test';

import { INITIAL_PAGES, MIN_AHEAD, PageLoader, STEP } from '../src/lib/pageLoader.ts';

const settle = () => new Promise((r) => setTimeout(r, 0));

function recorder(fail: Set<number> = new Set()) {
  const calls: number[] = [];
  const fetchOne = async (i: number) => {
    calls.push(i);
    return !fail.has(i);
  };
  return { calls, fetchOne };
}

test('loads the opening pages from the start page', async () => {
  const r = recorder();
  const l = new PageLoader(50, 4, r.fetchOne);
  assert.equal(await l.loadInitial(), true);
  assert.deepEqual(r.calls.sort((a, b) => a - b), Array.from({ length: INITIAL_PAGES }, (_, k) => 4 + k));
  assert.equal(l.loadedCount, INITIAL_PAGES);
});

test('reports a failed opening page and does not count it as loaded', async () => {
  const r = recorder(new Set([2]));
  const l = new PageLoader(20, 0, r.fetchOne);
  assert.equal(await l.loadInitial(), false);
  assert.equal(l.has(2), false);
  assert.equal(l.has(3), true);
});

test('keeps MIN_AHEAD pages ready ahead of the reader', async () => {
  const r = recorder();
  const l = new PageLoader(100, 0, r.fetchOne);
  await l.loadInitial();
  r.calls.length = 0;
  l.advance(INITIAL_PAGES - 1 - MIN_AHEAD);
  await settle();
  assert.deepEqual(r.calls, Array.from({ length: STEP }, (_, k) => INITIAL_PAGES + k));
});

test('a jump starts a fresh window at the new page', async () => {
  const r = recorder();
  const l = new PageLoader(100, 0, r.fetchOne);
  await l.loadInitial();
  r.calls.length = 0;
  l.advance(60);
  await settle();
  await settle();
  assert.equal(r.calls[0], 60);
  assert.ok(r.calls.every((i) => i >= 60 && i < 60 + INITIAL_PAGES));
});

test('stays inside the chapter and never fetches a page twice', async () => {
  const r = recorder();
  const l = new PageLoader(12, 0, r.fetchOne);
  await l.loadInitial();
  for (let p = 0; p < 12; p++) {
    l.advance(p);
    await settle();
  }
  assert.ok(r.calls.every((i) => i >= 0 && i < 12));
  assert.equal(new Set(r.calls).size, r.calls.length);
  assert.equal(l.loadedCount, 12);
});

test('nothing is fetched after stop()', async () => {
  const r = recorder();
  const l = new PageLoader(100, 0, r.fetchOne);
  await l.loadInitial();
  l.stop();
  r.calls.length = 0;
  l.advance(9);
  await settle();
  assert.deepEqual(r.calls, []);
});
