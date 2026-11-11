export const UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

async function get(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', ...headers } });
  if (!res.ok) throw new Error(`${url.split('/')[2]} answered ${res.status}`);
  return res;
}

export const getText = async (url: string, headers?: Record<string, string>) => (await get(url, headers)).text();
export const getJson = async <T>(url: string, headers?: Record<string, string>) =>
  (await get(url, headers)).json() as Promise<T>;

export function qs(params: (readonly [string, string | number])[]): string {
  return params.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const decodeHtml = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .trim();
