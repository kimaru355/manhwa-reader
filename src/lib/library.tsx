import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageAccessFramework as SAF } from 'expo-file-system/legacy';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { exportSnapshot, readBackup, resolveBackupDir, shareSnapshot, writeBackup } from './backup';
import * as cat from './listCategories';
import { mergeSnapshot } from './snapshotMerge';
import { cleanBookmark, cleanList, cleanRecent, cleanSeries } from './snapshotShape';
import type { CategoryState, Shelf } from './listCategories';
import type { Bookmark, Folder, Recent, Series, Snapshot } from './types';

const KEYS = {
  favorites: 'favorites4',
  recents: 'recents4',
  wishlist: 'wishlist4',
  bookmarks: 'bookmarks4',
  categories: 'listCategories1',
  categoriesAt: 'listCategoriesAt1',
  backupDir: 'backupDir',
} as const;
const MAX_RECENTS = 100;

async function load<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const save = (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

const toggled = (list: Series[], s: Series) =>
  list.some((x) => x.key === s.key) ? list.filter((x) => x.key !== s.key) : [s, ...list];

type LibraryContext = {
  ready: boolean;
  favorites: Series[];
  wishlist: Series[];
  recents: Recent[];
  getProgress: (key: string) => Recent | undefined;
  isFavorite: (key: string) => boolean;
  toggleFavorite: (s: Series) => void;
  isWishlisted: (key: string) => boolean;
  toggleWishlist: (s: Series) => void;
  /** Every bookmark, newest first. */
  bookmarks: Bookmark[];
  /** Bookmarks of one title, newest first. */
  getBookmarks: (seriesKey: string) => Bookmark[];
  addBookmark: (b: Omit<Bookmark, 'id' | 'ts'>) => void;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, note: string) => void;
  saveProgress: (p: Omit<Recent, 'ts'>) => void;
  removeRecent: (key: string) => void;
  clearRecents: () => void;
  /** Folder the app keeps its data in (survives reinstall), if one was chosen. */
  backupDir: Folder | null;
  lastBackup: number | null;
  backupError: string | null;
  /** Asks for a folder; `found` is an existing backup there. Nothing changes until enableBackup. */
  pickBackupFolder: () => Promise<{ dir: Folder; found: Snapshot | null } | null>;
  /** Starts auto-saving into `dir`, first restoring `restore` when given. */
  enableBackup: (dir: Folder, restore: Snapshot | null) => Promise<void>;
  stopBackup: () => void;
  exportBackup: () => Promise<string | null>;
  /** Opens the share sheet with a file of the data. False when sharing is not available. */
  shareBackup: () => Promise<boolean>;
  /** Replaces the app's data with a snapshot (from a backup file). */
  restoreSnapshot: (s: Snapshot) => void;
  /** Applies changes that came from the account's server on top of whatever is on the device now. */
  applySync: (patch: SyncPatch) => void;
  /** The reader's own categories for favorites and the wishlist (kept on this device and in backups). */
  categories: CategoryState;
  /** Adds a category; returns its id, or null when the name can't be used (see listCategories.nameProblem). */
  addCategory: (shelf: Shelf, name: string) => string | null;
  renameCategory: (shelf: Shelf, id: string, name: string) => void;
  deleteCategory: (shelf: Shelf, id: string) => void;
  moveCategory: (shelf: Shelf, id: string, direction: -1 | 1) => void;
  setInCategory: (shelf: Shelf, key: string, id: string, on: boolean) => void;
  /** When the categories last changed here (ms, 0 = never). */
  categoriesUpdatedAt: () => number;
  /** Takes the server's categories (they were newer). */
  applyRemoteCategories: (state: CategoryState, at: number) => void;
  /** Adds an imported file to the data here instead of replacing it. */
  mergeSnapshotIn: (s: Snapshot) => void;
};

export type SyncPatch = {
  favorites: { put: Series[]; remove: string[] };
  wishlist: { put: Series[]; remove: string[] };
  bookmarks: { put: Bookmark[]; remove: string[] };
};

const Ctx = createContext<LibraryContext | null>(null);

export const useLibrary = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLibrary must be used inside LibraryProvider');
  return v;
};

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [favorites, setFavorites] = useState<Series[]>([]);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [wishlist, setWishlist] = useState<Series[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [backupDir, setBackupDir] = useState<Folder | null>(null);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryState>(cat.emptyCategories);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backupDirRef = useRef<Folder | null>(null);
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef({ favorites, wishlist, recents, bookmarks, categories });
  useEffect(() => {
    latest.current = { favorites, wishlist, recents, bookmarks, categories };
  });

  /** When the categories last changed (ms). Sync compares it with the server's copy; the newer one wins. */
  const categoriesAt = useRef(0);

  /** Changes the categories and saves them. `at` is set when the change came from the server. */
  const changeCategories = useCallback((fn: (s: CategoryState) => CategoryState, at?: number) => {
    setCategories((prev) => {
      const next = fn(prev);
      if (next !== prev) {
        save(KEYS.categories, next);
        categoriesAt.current = at ?? Date.now();
        save(KEYS.categoriesAt, categoriesAt.current);
      }
      return next;
    });
  }, []);

  const categoriesUpdatedAt = useCallback(() => categoriesAt.current, []);
  const applyRemoteCategories = useCallback(
    (state: CategoryState, at: number) => changeCategories(() => state, at),
    [changeCategories],
  );
  const buildSnapshot = (): Snapshot => ({
    app: 'manhwa-reader',
    version: 2,
    savedAt: Date.now(),
    ...latest.current,
  });

  /** Writes to the backup folder; writes are queued so they never overlap. */
  const flushBackup = useCallback((snapshot?: Snapshot) => {
    const dir = backupDirRef.current;
    if (!dir) return Promise.resolve();
    const s = snapshot ?? buildSnapshot();
    writeChain.current = writeChain.current.then(async () => {
      try {
        await writeBackup(dir.uri, s);
        setLastBackup(s.savedAt);
        setBackupError(null);
      } catch {
        setBackupError('Could not write to the backup folder. Choose it again in Settings.');
      }
    });
    return writeChain.current;
  }, []);

  useEffect(() => {
    (async () => {
      const [fav, rec, wish, marks, bdir, cats, catsAt] = await Promise.all([
        load<unknown>(KEYS.favorites, []),
        load<unknown>(KEYS.recents, []),
        load<unknown>(KEYS.wishlist, []),
        load<unknown>(KEYS.bookmarks, []),
        load<Folder | null>(KEYS.backupDir, null),
        load<unknown>(KEYS.categories, null),
        load<number>(KEYS.categoriesAt, 0),
      ]);
      setCategories(cat.parseCategories(cats));
      categoriesAt.current = Number(catsAt) || 0;
      setBackupDir(bdir);
      backupDirRef.current = bdir;
      // Anything stored that isn't a usable entry is left out, so one bad row can't break the lists.
      setFavorites(cleanList(fav, cleanSeries, (s) => s.key));
      setRecents(cleanList(rec, cleanRecent, (r) => r.series.key));
      setWishlist(cleanList(wish, cleanSeries, (s) => s.key));
      setBookmarks(cleanList(marks, cleanBookmark, (b) => b.id));
      setReady(true);
    })();
  }, []);

  const toggleFavorite = useCallback((s: Series) => {
    if (latest.current.favorites.some((x) => x.key === s.key)) changeCategories((c) => cat.forgetTitle(c, 'favorites', s.key));
    setFavorites((prev) => {
      const next = toggled(prev, s);
      save(KEYS.favorites, next);
      return next;
    });
  }, [changeCategories]);

  const toggleWishlist = useCallback((s: Series) => {
    if (latest.current.wishlist.some((x) => x.key === s.key)) changeCategories((c) => cat.forgetTitle(c, 'wishlist', s.key));
    setWishlist((prev) => {
      const next = toggled(prev, s);
      save(KEYS.wishlist, next);
      return next;
    });
  }, [changeCategories]);

  const addBookmark = useCallback((b: Omit<Bookmark, 'id' | 'ts'>) => {
    const ts = Date.now();
    setBookmarks((prev) => {
      const next = [
        { ...b, note: b.note.trim(), id: `${ts}-${Math.random().toString(36).slice(2, 7)}`, ts, updatedAt: ts },
        ...prev,
      ];
      save(KEYS.bookmarks, next);
      return next;
    });
  }, []);

  const updateBookmark = useCallback((id: string, note: string) => {
    setBookmarks((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, note: note.trim(), updatedAt: Date.now() } : b));
      save(KEYS.bookmarks, next);
      return next;
    });
  }, []);

  const removeBookmark = useCallback((id: string) => {
    setBookmarks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      save(KEYS.bookmarks, next);
      return next;
    });
  }, []);

  const saveProgress = useCallback((p: Omit<Recent, 'ts'>) => {
    setRecents((prev) => {
      const next = [{ ...p, ts: Date.now() }, ...prev.filter((r) => r.series.key !== p.series.key)].slice(
        0,
        MAX_RECENTS,
      );
      // Page changes fire constantly while scrolling; only hit storage once things settle.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(KEYS.recents, next), 800);
      return next;
    });
  }, []);

  const removeRecent = useCallback((key: string) => {
    setRecents((prev) => {
      const next = prev.filter((r) => r.series.key !== key);
      save(KEYS.recents, next);
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecents([]);
    save(KEYS.recents, []);
  }, []);

  const restoreSnapshot = useCallback((s: Snapshot) => {
    // Backups made before categories existed leave the current ones as they are.
    if (s.categories) changeCategories(() => s.categories!);
    setFavorites(s.favorites);
    setWishlist(s.wishlist);
    setRecents(s.recents);
    setBookmarks(s.bookmarks);
    save(KEYS.favorites, s.favorites);
    save(KEYS.wishlist, s.wishlist);
    save(KEYS.recents, s.recents);
    save(KEYS.bookmarks, s.bookmarks);
  }, [changeCategories]);

  /** Adds an imported file to what is here (see snapshotMerge) instead of replacing it. */
  const mergeSnapshotIn = useCallback(
    (s: Snapshot) => restoreSnapshot(mergeSnapshot({ app: 'manhwa-reader', version: 2, savedAt: Date.now(), ...latest.current }, s)),
    [restoreSnapshot],
  );

  const applySync = useCallback((patch: SyncPatch) => {
    if (patch.favorites.remove.length || patch.wishlist.remove.length) {
      changeCategories((c) => {
        let next = c;
        for (const k of patch.favorites.remove) next = cat.forgetTitle(next, 'favorites', k);
        for (const k of patch.wishlist.remove) next = cat.forgetTitle(next, 'wishlist', k);
        return next;
      });
    }
    const apply = <T,>(list: T[], key: (x: T) => string, p: { put: T[]; remove: string[] }) => {
      if (!p.put.length && !p.remove.length) return list;
      const gone = new Set(p.remove);
      const put = new Map(p.put.map((x) => [key(x), x]));
      const kept = list.filter((x) => !gone.has(key(x))).map((x) => put.get(key(x)) ?? x);
      const have = new Set(kept.map(key));
      return [...kept, ...p.put.filter((x) => !have.has(key(x)))];
    };
    setFavorites((prev) => {
      const next = apply(prev, (s) => s.key, patch.favorites);
      if (next !== prev) save(KEYS.favorites, next);
      return next;
    });
    setWishlist((prev) => {
      const next = apply(prev, (s) => s.key, patch.wishlist);
      if (next !== prev) save(KEYS.wishlist, next);
      return next;
    });
    setBookmarks((prev) => {
      const next = apply(prev, (b) => b.id, patch.bookmarks);
      if (next !== prev) save(KEYS.bookmarks, next);
      return next;
    });
  }, [changeCategories]);

  const addCategory = useCallback(
    (shelf: Shelf, name: string) => {
      if (cat.nameProblem(latest.current.categories, shelf, name)) return null;
      const id = cat.newCategoryId();
      changeCategories((c) => cat.addCategory(c, shelf, name, id));
      return id;
    },
    [changeCategories],
  );
  const renameCategory = useCallback(
    (shelf: Shelf, id: string, name: string) => changeCategories((c) => cat.renameCategory(c, shelf, id, name)),
    [changeCategories],
  );
  const deleteCategory = useCallback(
    (shelf: Shelf, id: string) => changeCategories((c) => cat.deleteCategory(c, shelf, id)),
    [changeCategories],
  );
  const moveCategory = useCallback(
    (shelf: Shelf, id: string, direction: -1 | 1) => changeCategories((c) => cat.moveCategory(c, shelf, id, direction)),
    [changeCategories],
  );
  const setInCategory = useCallback(
    (shelf: Shelf, key: string, id: string, on: boolean) =>
      changeCategories((c) => cat.setInCategory(c, shelf, key, id, on)),
    [changeCategories],
  );

  const pickBackupFolder = useCallback(async () => {
    const res = await SAF.requestDirectoryPermissionsAsync();
    if (!res.granted) return null;
    const dir = await resolveBackupDir(res.directoryUri);
    return { dir, found: await readBackup(dir.uri) };
  }, []);

  const enableBackup = useCallback(
    async (dir: Folder, restore: Snapshot | null) => {
      if (restore) restoreSnapshot(restore);
      setBackupDir(dir);
      backupDirRef.current = dir;
      save(KEYS.backupDir, dir);
      // Restoring changes nothing in the file; otherwise this saves what is on the device now.
      if (restore) setLastBackup(restore.savedAt);
      else await flushBackup();
    },
    [restoreSnapshot, flushBackup],
  );

  const stopBackup = useCallback(() => {
    setBackupDir(null);
    backupDirRef.current = null;
    setLastBackup(null);
    setBackupError(null);
    AsyncStorage.removeItem(KEYS.backupDir).catch(() => {});
  }, []);

  const exportBackup = useCallback(() => exportSnapshot(buildSnapshot()), []);
  const shareBackup = useCallback(() => shareSnapshot(buildSnapshot()), []);

  // Auto-save shortly after anything changes, and right away when the app leaves the foreground.
  useEffect(() => {
    if (!ready || !backupDir) return;
    const t = setTimeout(() => flushBackup(), 2500);
    return () => clearTimeout(t);
  }, [ready, backupDir, favorites, wishlist, recents, bookmarks, categories, flushBackup]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && backupDirRef.current) flushBackup();
    });
    return () => sub.remove();
  }, [flushBackup]);

  const value = useMemo<LibraryContext>(() => {
    const favSet = new Set(favorites.map((s) => s.key));
    const wishSet = new Set(wishlist.map((s) => s.key));
    return {
      ready,
      favorites,
      wishlist,
      recents,
      getProgress: (key) => recents.find((r) => r.series.key === key),
      isFavorite: (key) => favSet.has(key),
      toggleFavorite,
      isWishlisted: (key) => wishSet.has(key),
      toggleWishlist,
      bookmarks,
      getBookmarks: (seriesKey) => bookmarks.filter((b) => b.seriesKey === seriesKey),
      addBookmark,
      removeBookmark,
      updateBookmark,
      saveProgress,
      removeRecent,
      clearRecents,
      backupDir,
      lastBackup,
      backupError,
      pickBackupFolder,
      enableBackup,
      stopBackup,
      exportBackup,
      shareBackup,
      restoreSnapshot,
      applySync,
      categories,
      addCategory,
      renameCategory,
      deleteCategory,
      moveCategory,
      setInCategory,
      categoriesUpdatedAt,
      applyRemoteCategories,
      mergeSnapshotIn,
    };
  }, [
    categories,
    addCategory,
    renameCategory,
    deleteCategory,
    moveCategory,
    setInCategory,
    categoriesUpdatedAt,
    applyRemoteCategories,
    mergeSnapshotIn,
    backupDir,
    lastBackup,
    backupError,
    pickBackupFolder,
    enableBackup,
    stopBackup,
    exportBackup,
    shareBackup,
    restoreSnapshot,
    applySync,
    ready,
    favorites,
    recents,
    wishlist,
    bookmarks,
    toggleFavorite,
    toggleWishlist,
    addBookmark,
    removeBookmark,
    updateBookmark,
    saveProgress,
    removeRecent,
    clearRecents,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
