import * as FS from 'expo-file-system/legacy';

import { hash } from './util';

// Chapters are copied into app cache and opened from there as plain file:// paths.
const dir = `${FS.cacheDirectory}pdf/`;
const MAX_FILES = 8;

const inflight = new Map<string, Promise<string>>();

export const localPath = (uri: string) => `${dir}${hash(uri)}.pdf`;

export function ensureLocal(uri: string): Promise<string> {
  const existing = inflight.get(uri);
  if (existing) return existing;
  const p = (async () => {
    const dest = localPath(uri);
    const info = await FS.getInfoAsync(dest);
    if (info.exists && info.size > 0) return dest;
    await FS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const tmp = `${dest}.tmp`;
    await FS.deleteAsync(tmp, { idempotent: true });
    await FS.copyAsync({ from: uri, to: tmp });
    await FS.moveAsync({ from: tmp, to: dest });
    return dest;
  })().finally(() => inflight.delete(uri));
  inflight.set(uri, p);
  return p;
}

/** Drops cached chapters beyond MAX_FILES, never touching the ones in `keep`. */
export async function prune(keep: string[]) {
  try {
    const names = await FS.readDirectoryAsync(dir);
    const keepNames = new Set(keep.map((p) => p.split('/').pop()));
    const extras = names.filter((n) => !keepNames.has(n));
    const excess = names.length - MAX_FILES;
    if (excess <= 0) return;
    await Promise.all(extras.slice(0, excess).map((n) => FS.deleteAsync(dir + n, { idempotent: true })));
  } catch {}
}
