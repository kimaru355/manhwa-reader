const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

export function hash(s: string): string {
  let a = 5381;
  let b = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = (Math.imul(a, 33) ^ c) >>> 0;
    b = (Math.imul(b, 31) + c) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

/**
 * SAF URIs carry the path inside the document id, e.g.
 * content://…/tree/primary%3AHDoujin/document/primary%3AHDoujin%2FSeries%2F001.pdf
 */
export function nameFromUri(uri: string): string {
  let s = uri;
  try {
    s = decodeURIComponent(uri);
  } catch {}
  const docId = s.includes('/document/') ? s.split('/document/').pop()! : s.split('/tree/').pop()!;
  const last = docId.split('/').pop() ?? docId;
  // A bare volume root looks like "primary:Folder" — drop the volume prefix.
  return docId.includes('/') ? last : last.replace(/^[^:]*:/, '');
}

export const isPdf = (uri: string) => /\.pdf$/i.test(nameFromUri(uri));

export const stripPdf = (name: string) => name.replace(/\.pdf$/i, '');

/** "Panty Note - chapters" -> "Panty Note" */
export const cleanTitle = (name: string) =>
  name.replace(/\s*[-–]\s*chapters?\s*$/i, '').trim() || name;

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
