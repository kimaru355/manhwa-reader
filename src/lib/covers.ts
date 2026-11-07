import * as FS from 'expo-file-system/legacy';
import PdfThumbnail from 'react-native-pdf-thumbnail';
import { useEffect, useState } from 'react';

import { ensureLocal } from './pdfCache';
import type { Manhwa } from './types';

const dir = `${FS.documentDirectory}covers/`;
const memo = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

async function render(m: Manhwa): Promise<string | null> {
  const dest = `${dir}${m.id}.jpg`;
  const info = await FS.getInfoAsync(dest);
  if (info.exists) return dest;

  const first = m.chapters[0]?.uri;
  if (!first) return null;
  await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});

  const opts = { maxWidth: 360, quality: 70 };
  let shot;
  try {
    shot = await PdfThumbnail.generate(first, 0, opts);
  } catch {
    shot = await PdfThumbnail.generate(await ensureLocal(first), 0, opts);
  }
  await FS.moveAsync({ from: shot.uri, to: dest });
  return dest;
}

/** Renders one cover at a time so scrolling a big library doesn't thrash I/O. */
export function getCover(m: Manhwa): Promise<string | null> {
  if (memo.has(m.id)) return Promise.resolve(memo.get(m.id)!);
  let p = pending.get(m.id);
  if (!p) {
    p = new Promise<string | null>((resolve) => {
      queue = queue.then(() =>
        render(m)
          .catch(() => null)
          .then((uri) => {
            if (uri) memo.set(m.id, uri);
            pending.delete(m.id);
            resolve(uri);
          }),
      );
    });
    pending.set(m.id, p);
  }
  return p;
}

export function useCover(m: Manhwa): string | null {
  const [uri, setUri] = useState<string | null>(memo.get(m.id) ?? null);
  useEffect(() => {
    let alive = true;
    getCover(m).then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [m.id]);
  return uri;
}
