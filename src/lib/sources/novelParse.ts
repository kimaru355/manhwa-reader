/**
 * Reading the pages of the Novel Fire and Standard Ebooks novel sources. Pure functions over HTML, so the node
 * tests run them against sample pages; the sources do the fetching.
 */
import { decodeHtml } from './html.ts';

export type Listed = { id: string; title: string; cover?: string };
export type ListedChapter = { id: string; name: string };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Text of an HTML fragment: tags dropped, entities decoded, spaces tidied. */
const text = (html: string) => decodeHtml(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** The paragraphs in an HTML fragment, without empty ones. */
function paragraphs(html: string): string[] {
  return [...html.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).filter(Boolean);
}

// --- Novel Fire ---------------------------------------------------------------------------------------------

export const NOVELFIRE = 'https://novelfire.net';

const absolute = (url: string) => (url.startsWith('/') ? `${NOVELFIRE}${url}` : url);

/** Novels on a browse or search page. */
export function nfNovels(html: string): Listed[] {
  const out: Listed[] = [];
  // Search pages end with a "Some Popular Novels" box that isn't part of the results.
  const end = html.indexOf('class="popular-novels"');
  const list = end > 0 ? html.slice(0, end) : html;
  for (const m of list.matchAll(/<li class="novel-item">([\s\S]*?)<\/li>/g)) {
    const item = m[1];
    const link = item.match(/<a[^>]*title="([^"]*)"[^>]*href="\/book\/([^"/?#]+)"/) ?? item.match(/<a[^>]*href="\/book\/([^"/?#]+)"[^>]*title="([^"]*)"/);
    if (!link) continue;
    const [id, title] = link[0].indexOf('title=') < link[0].indexOf('href=') ? [link[2], link[1]] : [link[1], link[2]];
    // Lists load covers lazily (data-src); search results have a plain src.
    const img = item.match(/<img[^>]*?(?:data-src|src)="((?!data:)[^"]+)"/)?.[1];
    out.push({ id, title: text(title), cover: img ? absolute(decodeHtml(img)) : undefined });
  }
  return out;
}

export const nfHasNext = (html: string) => /rel="next"/.test(html);

/** How many chapter-list pages a novel has (100 chapters a page). */
export function nfChapterPages(html: string): number {
  const pages = [...html.matchAll(/chapters\?page=(\d+)/g)].map((m) => Number(m[1]));
  return Math.max(1, ...pages);
}

/** Chapters on one chapter-list page, oldest first. */
export function nfChapterList(html: string, novelId: string): ListedChapter[] {
  const from = html.indexOf('class="chapter-list"');
  if (from < 0) return [];
  const re = new RegExp(`<a href="/book/${escape(novelId)}/([^"/?#]+)" title="([^"]*)"`, 'g');
  return [...html.slice(from).matchAll(re)].map((m) => ({ id: m[1], name: text(m[2]) || m[1] }));
}

/** The element starting at `start`, up to its matching `</div>`. */
function divAt(html: string, start: number): string {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = html.indexOf('>', start) + 1;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return html.slice(start);
}

/** A chapter's paragraphs, without the site's "read this on …" notes. */
export function nfChapter(html: string): string[] {
  const at = html.indexOf('id="content"');
  if (at < 0) return [];
  const start = html.lastIndexOf('<div', at);
  return paragraphs(divAt(html, start)).filter((p) => !/novel\s*fire|novelfire\.net/i.test(p));
}

// --- Standard Ebooks ----------------------------------------------------------------------------------------
// Free, carefully produced public-domain books (classic English and translated Western fiction). Every page has
// a hidden /honeypot link that bans the visitor for a day if followed; only `text/...` chapter links are used.

export const STANDARD_EBOOKS = 'https://standardebooks.org';

/** Book ids are their path ("jane-austen/pride-and-prejudice", sometimes with a translator) with `~` for `/`. */
export const seId = (path: string) => path.replace(/^\/?ebooks\//, '').replace(/\//g, '~');
export const sePath = (id: string) => id.replace(/~/g, '/');

const seAbsolute = (url: string) => (url.startsWith('/') ? `${STANDARD_EBOOKS}${url}` : url);

/** Books on a browse or search page. The title gets its author, since classics share titles. */
export function seBooks(html: string): Listed[] {
  const out: Listed[] = [];
  for (const m of html.matchAll(/<li typeof="schema:Book"[^>]*about="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)) {
    const item = m[2];
    const names = [...item.matchAll(/property="schema:name"[^>]*>([^<]*)</g)].map((n) => text(n[1]));
    if (!names[0]) continue;
    const img = item.match(/<img[^>]*src="([^"]+)"/)?.[1];
    out.push({
      id: seId(m[1]),
      title: names[1] ? `${names[0]} — ${names[1]}` : names[0],
      cover: img ? seAbsolute(decodeHtml(img)) : undefined,
    });
  }
  return out;
}

export const seHasNext = (html: string) => /rel="next"/.test(html);

/** Front and back matter in a book's table of contents, which isn't read. */
const SE_SKIP = /^(titlepage|imprint|halftitlepage|colophon|uncopyright|endnotes|loi|acknowledgments)$/;
/** A heading that is only a number ("IV", "12"). */
const BARE_NUMBER = /^([ivxlcdm]+|\d+)\.?$/i;

/**
 * The chapters in a book's table of contents, in reading order. The innermost entries are the chapters;
 * a chapter titled only with a number is named after the parts it sits in ("Book I · Part II · Chapter IV").
 */
export function seToc(html: string): ListedChapter[] {
  const start = html.indexOf('id="toc"');
  if (start < 0) return [];
  const end = html.indexOf('</nav>', start);
  const nav = html.slice(start, end > 0 ? end : undefined);
  const tokens = [...nav.matchAll(/<ol\b|<\/ol>|<a href="text\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const out: ListedChapter[] = [];
  const parents: string[] = [];
  let depth = 0;
  tokens.forEach((t, i) => {
    if (t[0] === '<ol') return void depth++;
    if (t[0] === '</ol>') return void depth--;
    const id = decodeHtml(t[1]);
    const label = text(t[2]);
    const file = id.split('#')[0];
    // The book's own title page groups everything; it isn't a part name.
    parents.length = depth;
    parents[depth - 1] = file === 'halftitlepage' ? '' : label;
    if (SE_SKIP.test(file) || tokens[i + 1]?.[0] === '<ol') return;
    const trail = parents.slice(0, depth - 1).filter(Boolean);
    const own = BARE_NUMBER.test(label) ? `Chapter ${label}` : label;
    out.push({ id, name: [...trail, own].join(' · ') || id });
  });
  return out;
}

/** The headings and paragraphs of a chapter page; `id` may name one section of it ("book-1#chapter-1-1"). */
export function seChapter(html: string, id: string): string[] {
  const frag = id.split('#')[1];
  let body: string;
  if (frag) {
    const at = html.search(new RegExp(`<section[^>]*id="${escape(frag)}"`));
    if (at < 0) return [];
    const re = /<section\b|<\/section>/g;
    re.lastIndex = html.indexOf('>', at) + 1;
    let depth = 1;
    let stop = html.length;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      depth += m[0] === '</section>' ? -1 : 1;
      if (depth === 0) {
        stop = m.index;
        break;
      }
    }
    body = html.slice(at, stop);
  } else {
    const at = html.indexOf('<main');
    const stop = html.indexOf('</main>', at);
    body = at < 0 ? html : html.slice(at, stop > 0 ? stop : undefined);
  }
  return [...body.matchAll(/<(h[1-6]|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)]
    .map((m) => {
      const t = text(m[2]);
      // A heading that is just "IV" is read (and shown) as "Chapter IV".
      return m[1] !== 'p' && BARE_NUMBER.test(t) ? `Chapter ${t}` : t;
    })
    .filter(Boolean);
}
