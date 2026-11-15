import type { CategoryState, ListCategory, Shelf, ShelfCategories } from './listCategories';
import type { Bookmark, Recent, Series, Snapshot } from './types';

/**
 * Adds an imported snapshot (someone else's export, or an older backup) to what is already in the app,
 * without losing anything on either side:
 *   - favorites and wishlist: everything here, then whatever the file adds;
 *   - history: one entry per title, the more recent one wins;
 *   - bookmarks: one per id, the more recently edited wins;
 *   - categories: matched by name (ignoring case), so "Romance" in both becomes one category holding the
 *     titles of both.
 * Pure: the same inputs always give the same result.
 */
export function mergeSnapshot(current: Snapshot, incoming: Snapshot, maxRecents = 100): Snapshot {
  return {
    app: 'manhwa-reader',
    version: 2,
    savedAt: Math.max(current.savedAt, incoming.savedAt),
    favorites: unionByKey(current.favorites, incoming.favorites),
    wishlist: unionByKey(current.wishlist, incoming.wishlist),
    recents: mergeRecents(current.recents, incoming.recents).slice(0, maxRecents),
    bookmarks: mergeBookmarks(current.bookmarks, incoming.bookmarks),
    categories: mergeCategories(current.categories, incoming.categories),
  };
}

function unionByKey(mine: Series[], theirs: Series[]): Series[] {
  const have = new Set(mine.map((s) => s.key));
  return [...mine, ...theirs.filter((s) => !have.has(s.key))];
}

function mergeRecents(mine: Recent[], theirs: Recent[]): Recent[] {
  const byKey = new Map<string, Recent>();
  for (const r of [...mine, ...theirs]) {
    const had = byKey.get(r.series.key);
    if (!had || r.ts > had.ts) byKey.set(r.series.key, r);
  }
  return [...byKey.values()].sort((a, b) => b.ts - a.ts);
}

const editedAt = (b: Bookmark) => b.updatedAt ?? b.ts;

function mergeBookmarks(mine: Bookmark[], theirs: Bookmark[]): Bookmark[] {
  const byId = new Map<string, Bookmark>();
  for (const b of [...mine, ...theirs]) {
    const had = byId.get(b.id);
    if (!had || editedAt(b) > editedAt(had)) byId.set(b.id, b);
  }
  return [...byId.values()].sort((a, b) => b.ts - a.ts);
}

const SHELVES: Shelf[] = ['favorites', 'wishlist'];
const MAX_CATEGORIES = 50;

function mergeCategories(mine?: CategoryState, theirs?: CategoryState): CategoryState | undefined {
  if (!theirs) return mine;
  if (!mine) return theirs;
  const out = {} as CategoryState;
  for (const shelf of SHELVES) out[shelf] = mergeShelf(mine[shelf], theirs[shelf]);
  return out;
}

function mergeShelf(mine: ShelfCategories, theirs: ShelfCategories): ShelfCategories {
  const list: ListCategory[] = [...mine.list];
  const byName = new Map(list.map((c) => [c.name.toLocaleLowerCase(), c.id] as const));
  const ids = new Set(list.map((c) => c.id));
  /** Their category id -> the id it has here. */
  const mapped = new Map<string, string>();
  for (const c of theirs.list) {
    const same = byName.get(c.name.toLocaleLowerCase());
    if (same) mapped.set(c.id, same);
    else if (list.length < MAX_CATEGORIES) {
      // Two devices could in theory pick the same random id for different categories.
      const id = ids.has(c.id) ? `${c.id}-i` : c.id;
      list.push({ id, name: c.name });
      ids.add(id);
      byName.set(c.name.toLocaleLowerCase(), id);
      mapped.set(c.id, id);
    }
  }
  const items: Record<string, string[]> = {};
  for (const [key, cats] of Object.entries(mine.items)) items[key] = [...cats];
  for (const [key, cats] of Object.entries(theirs.items)) {
    const here = cats.map((id) => mapped.get(id)).filter((id): id is string => !!id);
    if (here.length) items[key] = [...new Set([...(items[key] ?? []), ...here])];
  }
  return { list, items };
}
