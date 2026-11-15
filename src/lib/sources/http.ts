import { fetchSucceeded, FriendlyError, friendly } from '../errors';

export const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

const TIMEOUT_MS = 20_000;

async function get(url: string, headers?: Record<string, string>) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    fetchSucceeded();
    return res;
  } catch (e) {
    throw new FriendlyError(friendly(e));
  } finally {
    clearTimeout(timer);
  }
}

export const getText = async (url: string, headers?: Record<string, string>) => (await get(url, headers)).text();
export const getJson = async <T>(url: string, headers?: Record<string, string>) =>
  (await get(url, headers)).json() as Promise<T>;

export function qs(params: (readonly [string, string | number])[]): string {
  return params.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** The character with this code, or the text as written when the code isn't a real character. */
const fromCode = (code: number, written: string) => {
  try {
    return String.fromCodePoint(code);
  } catch {
    return written;
  }
};

export const decodeHtml = (s: string) =>
  s
    .replace(/&#(\d+);/g, (m, n) => fromCode(Number(n), m))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => fromCode(parseInt(n, 16), m))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .trim();
