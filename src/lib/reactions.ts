import { useEffect, useSyncExternalStore } from 'react';

import * as api from './api';
import { FriendlyError } from './errors';

export type ReactionType = 'comment' | 'author_rec' | 'community_rec' | 'author_bookmark' | 'community_bookmark';
export type Counts = { likes: number; dislikes: number; mine: -1 | 0 | 1 };
export type Target = { type: ReactionType; id: string };

/**
 * Ids for liking things that have no id of their own: the author's recommendation of a title and the author's
 * bookmarks. They must match the website's (site lib/shared.ts).
 */
export const authorRecId = (source: string, seriesId: string) => `${encodeURIComponent(source)}/${encodeURIComponent(seriesId)}`;
export const authorBookmarkId = (source: string, seriesId: string, chapterId: string, page = 1) =>
  `${authorRecId(source, seriesId)}/${encodeURIComponent(chapterId)}/${page}`;

const keyOf = (t: Target) => `${t.type}:${t.id}`;
const store = new Map<string, Counts>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Puts counts a list already came with into the store, so they aren't looked up again. */
export function seedReactions(items: (Target & Counts)[]) {
  for (const i of items) store.set(keyOf(i), { likes: i.likes, dislikes: i.dislikes, mine: i.mine });
  if (items.length) emit();
}

/** Forgets every count (after signing in or out, "mine" is different). */
export function resetReactions() {
  store.clear();
  emit();
}

let queued: Target[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const loading = new Set<string>();

function request(targets: Target[]) {
  for (const t of targets) {
    const k = keyOf(t);
    if (store.has(k) || loading.has(k)) continue;
    loading.add(k);
    queued.push(t);
  }
  if (!queued.length || timer) return;
  timer = setTimeout(async () => {
    const batch = queued.splice(0, 300);
    timer = null;
    try {
      const res = await api.publicPost<{ items: (Target & Counts)[] }>('/reactions', { targets: batch });
      seedReactions(res.items);
    } catch {
      // Counts stay hidden; the buttons still work.
    } finally {
      for (const t of batch) loading.delete(keyOf(t));
      if (queued.length) request([]);
    }
  }, 50);
}

/** Loads counts for these targets once (batched with every other button on screen). */
export function useLoadReactions(targets: Target[]) {
  const sig = targets.map(keyOf).join('|');
  useEffect(() => {
    request(targets);
    // The signature covers the targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useCounts(t: Target): Counts | undefined {
  const k = keyOf(t);
  return useSyncExternalStore(subscribe, () => store.get(k));
}

/** Likes or dislikes, or takes it back when it's what the reader already chose. Shown at once, undone on failure. */
export async function toggleReaction(t: Target, value: 1 | -1, signedIn: boolean): Promise<void> {
  if (!signedIn) throw new FriendlyError('Sign in to like or dislike. An account is only needed for this, not to read.');
  const k = keyOf(t);
  const before = store.get(k) ?? { likes: 0, dislikes: 0, mine: 0 };
  const next: -1 | 0 | 1 = before.mine === value ? 0 : value;
  store.set(k, {
    likes: before.likes - (before.mine === 1 ? 1 : 0) + (next === 1 ? 1 : 0),
    dislikes: before.dislikes - (before.mine === -1 ? 1 : 0) + (next === -1 ? 1 : 0),
    mine: next,
  });
  emit();
  try {
    store.set(k, await api.authed<Counts>('/reactions', { method: 'PUT', body: { type: t.type, id: t.id, value: next } }));
  } catch (e) {
    store.set(k, before);
    throw e;
  } finally {
    emit();
  }
}
