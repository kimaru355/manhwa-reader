import { FriendlyError } from '../errors';
import type { Series } from '../types';
import { getText } from './http';
import { STANDARD_EBOOKS, seBooks, seChapter, seHasNext, sePath, seToc, type Listed } from './novelParse';
import type { Source } from './types';

const toSeries = (n: Listed): Series => ({
  key: `standardebooks:${n.id}`,
  source: 'standardebooks',
  id: n.id,
  title: n.title,
  cover: n.cover,
  category: 'novel',
});

/** The address of a book's page; ids keep `~` where the path has `/`. */
const bookUrl = (id: string) => `${STANDARD_EBOOKS}/ebooks/${sePath(id).split('/').map(encodeURIComponent).join('/')}`;

/**
 * Standard Ebooks: free public-domain classics (English and translated Western novels), carefully edited,
 * already split into chapters. Browsing shows fiction by popularity; search covers the whole library.
 */
export const standardebooks: Source = {
  id: 'standardebooks',
  name: 'Classics',
  imageHeaders: {},
  kind: 'text',

  async browse({ page, query }) {
    const q = query?.trim();
    const url = q
      ? `${STANDARD_EBOOKS}/ebooks?query=${encodeURIComponent(q)}&sort=relevance&per-page=48&page=${page + 1}`
      : `${STANDARD_EBOOKS}/ebooks?tags%5B%5D=fiction&sort=popularity&per-page=48&page=${page + 1}`;
    const html = await getText(url);
    return { items: seBooks(html).map(toSeries), hasMore: seHasNext(html) };
  },

  async chapters(series) {
    return seToc(await getText(`${bookUrl(series.id)}/text`));
  },

  async pages() {
    return [];
  },

  async text(series, chapter) {
    // An id like "book-1#chapter-1-1" is one section of the file "book-1".
    const [file] = chapter.id.split('#');
    const paras = seChapter(await getText(`${bookUrl(series.id)}/text/${encodeURIComponent(file)}`), chapter.id);
    if (!paras.length) throw new FriendlyError('Chapter text not found.');
    return paras;
  },
};
