import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  nfChapter,
  nfChapterList,
  nfChapterPages,
  nfHasNext,
  nfNovels,
  seBooks,
  seChapter,
  seHasNext,
  seId,
  sePath,
  seToc,
} from '../src/lib/sources/novelParse.ts';

// Small pages shaped like the real ones (the markup the parsers read), with made-up text.

test('Novel Fire: novels from a browse page (lazy covers) and a search page (popular box left out)', () => {
  const browse = `<ul class="novel-list"><li class="novel-item"><a title="The Long Road" href="/book/the-long-road"><figure class="novel-cover">
    <img class="lazy" src="data:image/gif;base64,R0lGOD" data-src="/server-1/the-long-road.jpg" alt=""></figure>
    <h4 class="novel-title">The Long Road</h4></a></li></ul><a rel="next" href="?page=2">Next</a>`;
  assert.deepEqual(nfNovels(browse), [
    { id: 'the-long-road', title: 'The Long Road', cover: 'https://novelfire.net/server-1/the-long-road.jpg' },
  ]);
  assert.equal(nfHasNext(browse), true);

  const search = `<section id="novelListBase"><li class="novel-item"><a title="Sea &amp; Sky" href="/book/sea-and-sky">
    <img src="/server-1/sea-and-sky.jpg" alt=""></a></li></section>
    <section class="popular-novels"><li class="novel-item"><a title="Other" href="/book/other"></a></li></section>`;
  assert.deepEqual(
    nfNovels(search).map((n) => [n.id, n.title]),
    [['sea-and-sky', 'Sea & Sky']],
  );
  assert.equal(nfHasNext(search), false);
});

test('Novel Fire: chapter list pages', () => {
  const page = `<a href="/book/the-long-road/chapter-90" title="Chapter 90 Latest">latest</a>
    <ul class="chapter-list"><li><a href="/book/the-long-road/chapter-1" title="Chapter 1 - Dawn"><span>1</span></a></li>
    <li><a href="/book/the-long-road/chapter-2" title="Chapter 2 - Noon &amp; Dusk"></a></li></ul>
    <a href="?page=2">2</a><a href="https://novelfire.net/book/the-long-road/chapters?page=3">3</a>`;
  assert.deepEqual(nfChapterList(page, 'the-long-road'), [
    { id: 'chapter-1', name: 'Chapter 1 - Dawn' },
    { id: 'chapter-2', name: 'Chapter 2 - Noon & Dusk' },
  ]);
  assert.equal(nfChapterPages(page), 3);
  assert.equal(nfChapterPages('<ul class="chapter-list"></ul>'), 1);
});

test('Novel Fire: chapter text stops at the content block and drops site notes', () => {
  const html = `<div class="chapter"><div id="content" class="clearfix"><p>First line.</p><div class="ad"><p>Ad text</p></div>
    <p>Second &ldquo;line&rdquo;.</p><p>Read the latest on novelfire.net</p><p> </p></div><p>Footer</p></div>`;
  assert.deepEqual(nfChapter(html), ['First line.', 'Ad text', 'Second “line”.']);
  assert.deepEqual(nfChapter('<p>no content block</p>'), []);
});

test('Standard Ebooks: book ids keep their path with ~', () => {
  assert.equal(seId('/ebooks/leo-tolstoy/war-and-peace/louise-maude_aylmer-maude'), 'leo-tolstoy~war-and-peace~louise-maude_aylmer-maude');
  assert.equal(sePath('jane-austen~pride-and-prejudice'), 'jane-austen/pride-and-prejudice');
});

test('Standard Ebooks: books on a list page get their author', () => {
  const html = `<ol><li typeof="schema:Book" about="/ebooks/jane-austen/emma"><a><picture><img src="/images/covers/emma/cover@2x.jpg" alt=""/></picture></a>
    <p><a href="/ebooks/jane-austen/emma"><span property="schema:name">Emma</span></a></p>
    <p class="author"><a><span property="schema:name">Jane Austen</span></a></p></li></ol><a rel="next" href="/ebooks?page=2">Next</a>`;
  assert.deepEqual(seBooks(html), [
    { id: 'jane-austen~emma', title: 'Emma — Jane Austen', cover: 'https://standardebooks.org/images/covers/emma/cover@2x.jpg' },
  ]);
  assert.equal(seHasNext(html), true);
});

test('Standard Ebooks: the table of contents gives the chapters, named after their parts', () => {
  const html = `<nav><a href="/honeypot" hidden>x</a></nav><nav id="toc"><ol>
    <li><a href="text/titlepage">Titlepage</a></li><li><a href="text/imprint">Imprint</a></li>
    <li><a href="text/preface">Preface</a></li>
    <li><a href="text/halftitlepage">A Big Book</a><ol>
      <li><a href="text/book-1">Book <span>I</span></a><ol>
        <li><a href="text/chapter-1-1">I</a></li>
        <li><a href="text/chapter-1-2">The Storm</a></li>
      </ol></li>
      <li><a href="text/book-2#chapter-2-1">II</a></li>
    </ol></li>
    <li><a href="text/colophon">Colophon</a></li></ol></nav>
    <nav id="landmarks"><ol><li><a href="text/chapter-1-1">Body</a></li></ol></nav>`;
  assert.deepEqual(seToc(html), [
    { id: 'preface', name: 'Preface' },
    { id: 'chapter-1-1', name: 'Book I · Chapter I' },
    { id: 'chapter-1-2', name: 'Book I · The Storm' },
    { id: 'book-2#chapter-2-1', name: 'Chapter II' },
  ]);
});

test('Standard Ebooks: chapter text, a whole page or one section of it', () => {
  const page = `<body><header><a href="/honeypot">x</a></header><main><section id="chapter-1"><h2>IV</h2>
    <p>It was <i>very</i> late.</p><p>“Go,” he said.</p></section></main><footer><p>Footer</p></footer></body>`;
  assert.deepEqual(seChapter(page, 'chapter-1'), ['Chapter IV', 'It was very late.', '“Go,” he said.']);

  const book = `<main><section id="book-2"><h2>Book II</h2><section id="chapter-2-1"><h3>I</h3><p>One.</p>
    <section id="note"><p>Inner.</p></section></section><section id="chapter-2-2"><h3>II</h3><p>Two.</p></section></section></main>`;
  assert.deepEqual(seChapter(book, 'book-2#chapter-2-1'), ['Chapter I', 'One.', 'Inner.']);
  assert.deepEqual(seChapter(book, 'book-2#missing'), []);
});
