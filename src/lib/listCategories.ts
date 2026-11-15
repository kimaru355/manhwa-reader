/**
 * Categories the reader makes for their favorites and wishlist ("Romance", "Finished", "Read next"…). "All" is
 * not stored: it is simply no filter. A title can be in several categories of the same list.
 *
 * Plain data and pure functions only, so the same rules apply wherever this is used (and they can be tested).
 */
export type Shelf = 'favorites' | 'wishlist';
export type ListCategory = { id: string; name: string };
export type ShelfCategories = {
  /** In the order the reader made them. */
  list: ListCategory[];
  /** Title key -> ids of the categories it is in. */
  items: Record<string, string[]>;
};
export type CategoryState = Record<Shelf, ShelfCategories>;

export const SHELVES: Shelf[] = ['favorites', 'wishlist'];
export const MAX_NAME = 30;
export const MAX_CATEGORIES = 50;

export const emptyCategories = (): CategoryState => ({
  favorites: { list: [], items: {} },
  wishlist: { list: [], items: {} },
});

/** Trimmed, single-spaced, at most MAX_NAME characters. */
export const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

const sameName = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

const withShelf = (s: CategoryState, shelf: Shelf, next: ShelfCategories): CategoryState => ({ ...s, [shelf]: next });

export type NameProblem = 'empty' | 'taken' | 'full';

/** Why `name` can't be used for a new (or renamed, when `exceptId` is given) category, or null if it can. */
export function nameProblem(s: CategoryState, shelf: Shelf, name: string, exceptId?: string): NameProblem | null {
  const n = cleanName(name);
  if (!n) return 'empty';
  if (s[shelf].list.some((c) => c.id !== exceptId && sameName(c.name, n))) return 'taken';
  if (!exceptId && s[shelf].list.length >= MAX_CATEGORIES) return 'full';
  return null;
}

export const NAME_PROBLEM_TEXT: Record<NameProblem, string> = {
  empty: 'Type a name for the category.',
  taken: 'You already have a category with that name.',
  full: `You can have up to ${MAX_CATEGORIES} categories in a list.`,
};

/** Adds a category. Returns the state unchanged when the name can't be used (see nameProblem). */
export function addCategory(s: CategoryState, shelf: Shelf, name: string, id: string): CategoryState {
  if (nameProblem(s, shelf, name)) return s;
  const cur = s[shelf];
  return withShelf(s, shelf, { ...cur, list: [...cur.list, { id, name: cleanName(name) }] });
}

export function renameCategory(s: CategoryState, shelf: Shelf, id: string, name: string): CategoryState {
  if (nameProblem(s, shelf, name, id)) return s;
  const cur = s[shelf];
  return withShelf(s, shelf, { ...cur, list: cur.list.map((c) => (c.id === id ? { ...c, name: cleanName(name) } : c)) });
}

/** Deletes a category. The titles in it stay in the list; they just lose that category. */
export function deleteCategory(s: CategoryState, shelf: Shelf, id: string): CategoryState {
  const cur = s[shelf];
  const items: Record<string, string[]> = {};
  for (const [key, ids] of Object.entries(cur.items)) {
    const left = ids.filter((x) => x !== id);
    if (left.length) items[key] = left;
  }
  return withShelf(s, shelf, { list: cur.list.filter((c) => c.id !== id), items });
}

/** Moves a category one place earlier (-1) or later (1). */
export function moveCategory(s: CategoryState, shelf: Shelf, id: string, direction: -1 | 1): CategoryState {
  const list = [...s[shelf].list];
  const from = list.findIndex((c) => c.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return s;
  [list[from], list[to]] = [list[to], list[from]];
  return withShelf(s, shelf, { ...s[shelf], list });
}

/** Puts a title in a category (`on`) or takes it out. */
export function setInCategory(s: CategoryState, shelf: Shelf, key: string, id: string, on: boolean): CategoryState {
  const cur = s[shelf];
  if (!cur.list.some((c) => c.id === id)) return s;
  const had = cur.items[key] ?? [];
  if (had.includes(id) === on) return s;
  const ids = on ? [...had, id] : had.filter((x) => x !== id);
  const items = { ...cur.items };
  if (ids.length) items[key] = ids;
  else delete items[key];
  return withShelf(s, shelf, { ...cur, items });
}

/** Drops what is known about a title that left the list, so re-adding it later starts uncategorised. */
export function forgetTitle(s: CategoryState, shelf: Shelf, key: string): CategoryState {
  if (!(key in s[shelf].items)) return s;
  const items = { ...s[shelf].items };
  delete items[key];
  return withShelf(s, shelf, { ...s[shelf], items });
}

/** Ids of the categories a title is in, in category order. */
export function categoriesOf(s: CategoryState, shelf: Shelf, key: string): string[] {
  const ids = new Set(s[shelf].items[key] ?? []);
  return s[shelf].list.filter((c) => ids.has(c.id)).map((c) => c.id);
}

/** The titles of `list` in category `id`; with no id (All), the whole list. */
export function filterByCategory<T extends { key: string }>(
  list: T[],
  s: CategoryState,
  shelf: Shelf,
  id: string | null,
): T[] {
  if (!id) return list;
  return list.filter((x) => s[shelf].items[x.key]?.includes(id));
}

/** How many titles of `list` each category holds. */
export function countByCategory(list: { key: string }[], s: CategoryState, shelf: Shelf): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of s[shelf].list) out[c.id] = 0;
  for (const x of list) for (const id of s[shelf].items[x.key] ?? []) if (id in out) out[id]++;
  return out;
}

/** Accepts stored or imported data and keeps only what is well-formed. */
export function parseCategories(raw: unknown): CategoryState {
  const out = emptyCategories();
  if (!raw || typeof raw !== 'object') return out;
  for (const shelf of SHELVES) {
    const r = (raw as Record<string, unknown>)[shelf] as { list?: unknown; items?: unknown } | undefined;
    if (!r || typeof r !== 'object') continue;
    const list: ListCategory[] = [];
    const seen = new Set<string>();
    for (const c of Array.isArray(r.list) ? r.list : []) {
      const id = typeof c?.id === 'string' ? c.id.slice(0, 64) : '';
      const name = typeof c?.name === 'string' ? cleanName(c.name) : '';
      if (!id || !name || seen.has(id) || list.length >= MAX_CATEGORIES) continue;
      seen.add(id);
      list.push({ id, name });
    }
    const items: Record<string, string[]> = {};
    if (r.items && typeof r.items === 'object') {
      for (const [key, ids] of Object.entries(r.items as Record<string, unknown>)) {
        const valid = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === 'string' && seen.has(x)))] : [];
        if (valid.length) items[key] = valid;
      }
    }
    out[shelf] = { list, items };
  }
  return out;
}

/** A new category id that is unique enough on one device. */
export const newCategoryId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
