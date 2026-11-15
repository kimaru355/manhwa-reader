import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import * as api from './api';
import { accountsEnabled } from './config';
import { friendly } from './errors';
import { useLibrary } from './library';
import { parseCategories, type CategoryState } from './listCategories';
import { resetReactions } from './reactions';
import { threeWay } from './merge';
import { sendableBookmark, sendableSeries, toServerBookmark, toServerSeries } from './syncShape';
import type { Bookmark, Series, Tier } from './types';

export type UserRecommendation = {
  id: string;
  source: Series['source'];
  seriesId: string;
  title: string;
  cover: string | null;
  url: string | null;
  category: Series['category'];
  tier: Tier;
  note: string | null;
  createdAt: string;
};

type AccountContext = {
  enabled: boolean;
  user: { id: string; email: string } | null;
  syncing: boolean;
  lastSync: number | null;
  syncError: string | null;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  syncNow: () => Promise<void>;
  recommend: (series: Series, tier: Tier, note: string) => Promise<void>;
  myRecommendations: () => Promise<UserRecommendation[]>;
  removeRecommendation: (id: string) => Promise<void>;
};

const Ctx = createContext<AccountContext | null>(null);

export const useAccount = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccount must be used inside AccountProvider');
  return v;
};

/** What both sides agreed on at the last sync. `bookmarkVersions` (added in 1.3.1) is each bookmark's updatedAt then. */
type Base = { favorites: string[]; wishlist: string[]; bookmarks: string[]; bookmarkVersions?: Record<string, number> };
const versionOf = (b: Bookmark) => b.updatedAt ?? b.ts;
const baseKey = (uid: string) => `syncBase2:${uid}`;

type Kind = 'favorite' | 'wishlist';
type FavItem = { kind: Kind; seriesKey: string; series: Series };
/** Categories travel as one document; the copy that changed last wins. */
type CategoriesDoc = { data: CategoryState; updatedAt: number };
type SyncState = { favorites: FavItem[]; bookmarks: Bookmark[]; categories?: CategoriesDoc | null };

/** A link the server will show to other readers (https, of a sensible length), otherwise none. */
const publicLink = (u: string | undefined) => (u && /^https:\/\//i.test(u) && u.length <= 2000 ? u : null);

/** The server accepts at most 500 changes per request. */
const BATCH = 500;

type Op =
  | { t: 'favPut'; v: FavItem }
  | { t: 'favRemove'; v: { kind: Kind; seriesKey: string } }
  | { t: 'markPut'; v: Bookmark }
  | { t: 'markRemove'; v: string };

/** The stored base, or an empty one when there is none or it can't be read (then nothing is treated as deleted). */
function parseBase(raw: string | null): Base {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  try {
    const o = raw ? (JSON.parse(raw) as Partial<Base>) : null;
    if (o && typeof o === 'object') {
      return {
        favorites: list(o.favorites),
        wishlist: list(o.wishlist),
        bookmarks: list(o.bookmarks),
        bookmarkVersions: o.bookmarkVersions && typeof o.bookmarkVersions === 'object' ? o.bookmarkVersions : undefined,
      };
    }
  } catch {
    // Unreadable: start again from an empty base.
  }
  return { favorites: [], wishlist: [], bookmarks: [] };
}

function toBody(ops: Op[]) {
  const body = {
    favorites: { put: [] as FavItem[], remove: [] as { kind: Kind; seriesKey: string }[] },
    bookmarks: { put: [] as Bookmark[], remove: [] as string[] },
  };
  for (const op of ops) {
    if (op.t === 'favPut') body.favorites.put.push(op.v);
    else if (op.t === 'favRemove') body.favorites.remove.push(op.v);
    else if (op.t === 'markPut') body.bookmarks.put.push(op.v);
    else body.bookmarks.remove.push(op.v);
  }
  return body;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const lib = useLibrary();
  const [user, setUser] = useState<AccountContext['user']>(null);
  useEffect(() => {
    resetReactions();
  }, [user?.id]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const libRef = useRef(lib);
  useEffect(() => {
    libRef.current = lib;
  });
  const busy = useRef(false);
  const again = useRef(false);
  const rerun = useRef<() => void>(() => {});

  const syncNow = useCallback(async () => {
    const s = await api.loadSession();
    if (!accountsEnabled || !s) return;
    // Until the library has been read from storage it looks empty, and merging an empty library against the
    // last sync would read every title and bookmark as "deleted here" and remove them from the account.
    // The effect below syncs as soon as it is ready.
    if (!libRef.current.ready) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    setSyncing(true);
    try {
      const uid = s.user.id;
      const [remote, rawBase] = await Promise.all([
        api.authed<SyncState>('/me/sync'),
        AsyncStorage.getItem(baseKey(uid)).catch(() => null),
      ]);
      // Read after the request, so a change made while it was in flight is part of this merge.
      const { favorites, wishlist, bookmarks, applySync, categories, categoriesUpdatedAt, applyRemoteCategories } =
        libRef.current;
      const base = parseBase(rawBase);
      const same = () => 'same' as const;
      const of = (kind: Kind) =>
        new Map(remote.favorites.filter((r) => r.kind === kind).map((r) => [r.seriesKey, r.series] as const));

      const fav = threeWay(new Map(favorites.map((x) => [x.key, x])), of('favorite'), new Set(base.favorites), same, undefined, sendableSeries);
      const wish = threeWay(new Map(wishlist.map((x) => [x.key, x])), of('wishlist'), new Set(base.wishlist), same, undefined, sendableSeries);
      const marks = threeWay(
        new Map(bookmarks.map((x) => [x.id, x])),
        new Map(remote.bookmarks.map((b) => [b.id, b])),
        new Set(base.bookmarks),
        (l, r) => {
          const a = versionOf(l);
          const b = versionOf(r);
          return a === b ? 'same' : a > b ? 'local' : 'remote';
        },
        // A note edited on one phone is kept even if the bookmark was deleted on another.
        { version: versionOf, baseVersion: new Map(Object.entries(base.bookmarkVersions ?? {})) },
        sendableBookmark,
      );

      // Server first: if it fails nothing has changed locally and the next sync retries.
      const ops: Op[] = [
        ...fav.toRemote.map((x): Op => ({ t: 'favPut', v: { kind: 'favorite', seriesKey: x.key, series: toServerSeries(x) } })),
        ...wish.toRemote.map((x): Op => ({ t: 'favPut', v: { kind: 'wishlist', seriesKey: x.key, series: toServerSeries(x) } })),
        ...fav.deleteRemote.map((k): Op => ({ t: 'favRemove', v: { kind: 'favorite', seriesKey: k } })),
        ...wish.deleteRemote.map((k): Op => ({ t: 'favRemove', v: { kind: 'wishlist', seriesKey: k } })),
        ...marks.toRemote.map((b): Op => ({ t: 'markPut', v: toServerBookmark(b) })),
        ...marks.deleteRemote.map((id): Op => ({ t: 'markRemove', v: id })),
      ];
      // Categories: whichever side changed them last wins as a whole.
      const localAt = categoriesUpdatedAt();
      const remoteCats = remote.categories ?? null;
      let sendCategories: CategoriesDoc | undefined;
      if (remoteCats && remoteCats.updatedAt > localAt) {
        applyRemoteCategories(parseCategories(remoteCats.data), remoteCats.updatedAt);
      } else if (localAt > (remoteCats?.updatedAt ?? 0)) {
        sendCategories = { data: categories, updatedAt: localAt };
      }

      for (let i = 0; i < ops.length || (i === 0 && sendCategories); i += BATCH) {
        const body = { ...toBody(ops.slice(i, i + BATCH)), ...(i === 0 && sendCategories ? { categories: sendCategories } : {}) };
        await api.authed('/me/sync', { method: 'POST', body });
      }

      // Signed out (or in as someone else) while this ran: what came back belongs to the other account.
      if ((await api.loadSession())?.user.id !== uid) return;

      applySync({
        favorites: { put: fav.toLocal, remove: fav.deleteLocal },
        wishlist: { put: wish.toLocal, remove: wish.deleteLocal },
        bookmarks: { put: marks.toLocal, remove: marks.deleteLocal },
      });
      // Versions as they are on both sides now: the winner of each conflict, or the unchanged item.
      const merged = new Map<string, Bookmark>([
        ...bookmarks.map((b) => [b.id, b] as const),
        ...remote.bookmarks.map((b) => [b.id, b] as const),
      ]);
      for (const b of [...marks.toLocal, ...marks.toRemote]) merged.set(b.id, b);
      const bookmarkVersions: Record<string, number> = {};
      for (const id of marks.result) {
        const b = merged.get(id);
        if (b) bookmarkVersions[id] = versionOf(b);
      }
      await AsyncStorage.setItem(
        baseKey(uid),
        JSON.stringify({
          favorites: fav.result,
          wishlist: wish.result,
          bookmarks: marks.result,
          bookmarkVersions,
        } satisfies Base),
      ).catch(() => {});
      setLastSync(Date.now());
      setSyncError(null);
    } catch (e) {
      setSyncError(friendly(e));
      // The login may have ended while syncing.
      if (!(await api.loadSession())) setUser(null);
    } finally {
      busy.current = false;
      setSyncing(false);
      if (again.current) {
        again.current = false;
        setTimeout(() => rerun.current(), 500);
      }
    }
  }, []);

  useEffect(() => {
    rerun.current = () => {
      syncNow();
    };
  }, [syncNow]);

  // Pick up an existing login when the app starts.
  useEffect(() => {
    if (!accountsEnabled) return;
    api.loadSession().then((s) => {
      if (!s) return;
      setUser(s.user);
      syncNow();
    });
  }, [syncNow]);

  // Changes made on this phone are uploaded shortly after they happen.
  useEffect(() => {
    if (!user || !lib.ready) return;
    const t = setTimeout(() => syncNow(), 3000);
    return () => clearTimeout(t);
  }, [user, lib.ready, lib.favorites, lib.wishlist, lib.bookmarks, lib.categories, syncNow]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      const res = await api.signUp(email.trim(), password);
      if (res.session) {
        setUser(res.session.user);
        syncNow();
      }
      return { needsConfirmation: res.needsConfirmation };
    },
    [syncNow],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const s = await api.signIn(email.trim(), password);
      setUser(s.user);
      setSyncError(null);
      syncNow();
    },
    [syncNow],
  );

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
    setLastSync(null);
    setSyncError(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    setUser(null);
    setLastSync(null);
    setSyncError(null);
  }, []);

  const recommend = useCallback(async (series: Series, tier: Tier, note: string) => {
    await api.authed('/me/recommendations', {
      method: 'POST',
      body: {
        source: series.source,
        seriesId: series.id,
        title: series.title.slice(0, 300),
        cover: publicLink(series.cover),
        url: publicLink(series.url),
        category: series.category,
        tier,
        note: note.trim() || null,
      },
    });
  }, []);

  const myRecommendations = useCallback(
    async () => (await api.authed<{ items: UserRecommendation[] }>('/me/recommendations')).items,
    [],
  );

  const removeRecommendation = useCallback(async (id: string) => {
    await api.authed(`/me/recommendations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }, []);

  const value = useMemo<AccountContext>(
    () => ({
      enabled: accountsEnabled,
      user,
      syncing,
      lastSync,
      syncError,
      signUp,
      signIn,
      signOut,
      forgotPassword: api.forgotPassword,
      deleteAccount,
      syncNow,
      recommend,
      myRecommendations,
      removeRecommendation,
    }),
    [user, syncing, lastSync, syncError, signUp, signIn, signOut, deleteAccount, syncNow, recommend, myRecommendations, removeRecommendation],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
