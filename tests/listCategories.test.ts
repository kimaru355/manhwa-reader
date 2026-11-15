import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addCategory,
  categoriesOf,
  countByCategory,
  deleteCategory,
  emptyCategories,
  filterByCategory,
  forgetTitle,
  MAX_CATEGORIES,
  moveCategory,
  nameProblem,
  parseCategories,
  renameCategory,
  setInCategory,
} from '../src/lib/listCategories.ts';

const titles = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

function sample() {
  let s = emptyCategories();
  s = addCategory(s, 'favorites', '  Romance  ', 'r');
  s = addCategory(s, 'favorites', 'Finished', 'f');
  s = setInCategory(s, 'favorites', 'a', 'r', true);
  s = setInCategory(s, 'favorites', 'b', 'r', true);
  s = setInCategory(s, 'favorites', 'b', 'f', true);
  return s;
}

test('names are trimmed and must be unique (ignoring case) within a list', () => {
  const s = sample();
  assert.equal(s.favorites.list[0].name, 'Romance');
  assert.equal(nameProblem(s, 'favorites', 'romance'), 'taken');
  assert.equal(nameProblem(s, 'favorites', '   '), 'empty');
  assert.equal(nameProblem(s, 'wishlist', 'Romance'), null, 'the other list is separate');
  assert.equal(addCategory(s, 'favorites', 'ROMANCE', 'x'), s, 'a duplicate changes nothing');
});

test('a list holds at most MAX_CATEGORIES categories', () => {
  let s = emptyCategories();
  for (let i = 0; i < MAX_CATEGORIES; i++) s = addCategory(s, 'wishlist', `c${i}`, `id${i}`);
  assert.equal(nameProblem(s, 'wishlist', 'one more'), 'full');
  assert.equal(s.wishlist.list.length, MAX_CATEGORIES);
});

test('All shows everything; a category shows only its titles', () => {
  const s = sample();
  assert.deepEqual(filterByCategory(titles, s, 'favorites', null), titles);
  assert.deepEqual(filterByCategory(titles, s, 'favorites', 'r').map((x) => x.key), ['a', 'b']);
  assert.deepEqual(filterByCategory(titles, s, 'favorites', 'f').map((x) => x.key), ['b']);
  assert.deepEqual(countByCategory(titles, s, 'favorites'), { r: 2, f: 1 });
});

test('a title can be in several categories and taken out of one', () => {
  let s = sample();
  assert.deepEqual(categoriesOf(s, 'favorites', 'b'), ['r', 'f']);
  s = setInCategory(s, 'favorites', 'b', 'r', false);
  assert.deepEqual(categoriesOf(s, 'favorites', 'b'), ['f']);
  s = setInCategory(s, 'favorites', 'b', 'f', false);
  assert.equal('b' in s.favorites.items, false, 'no empty entries are kept');
});

test('renaming keeps the titles; deleting removes the category from every title', () => {
  let s = renameCategory(sample(), 'favorites', 'r', 'Love');
  assert.equal(s.favorites.list[0].name, 'Love');
  assert.deepEqual(categoriesOf(s, 'favorites', 'a'), ['r']);
  assert.equal(renameCategory(s, 'favorites', 'r', 'finished'), s, 'cannot take another name');
  s = deleteCategory(s, 'favorites', 'r');
  assert.deepEqual(s.favorites.list.map((c) => c.id), ['f']);
  assert.deepEqual(s.favorites.items, { b: ['f'] });
});

test('categories can be reordered', () => {
  const s = moveCategory(sample(), 'favorites', 'f', -1);
  assert.deepEqual(s.favorites.list.map((c) => c.id), ['f', 'r']);
  assert.equal(moveCategory(s, 'favorites', 'f', -1), s, 'already first');
});

test('a title that leaves the list is forgotten', () => {
  const s = forgetTitle(sample(), 'favorites', 'b');
  assert.deepEqual(Object.keys(s.favorites.items), ['a']);
});

test('only well-formed stored data is kept', () => {
  const s = parseCategories({
    favorites: {
      list: [{ id: 'r', name: ' Romance ' }, { id: 'r', name: 'dup id' }, { id: '', name: 'x' }, { id: 'n' }],
      items: { a: ['r', 'r', 'missing', 5], b: 'nope', c: [] },
    },
    wishlist: 'bad',
  });
  assert.deepEqual(s.favorites.list, [{ id: 'r', name: 'Romance' }]);
  assert.deepEqual(s.favorites.items, { a: ['r'] });
  assert.deepEqual(s.wishlist, { list: [], items: {} });
  assert.deepEqual(parseCategories(null), emptyCategories());
});
