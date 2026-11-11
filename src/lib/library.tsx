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

import { exportSnapshot, readBackup, resolveBackupDir, writeBackup } from './backup';
import type { Bookmark, Folder, Recent, Series, Snapshot } from './types';

const KEYS = {
  favorites: 'favorites4',
  recents: 'recents4',
  wishlist: 'wishlist4',
  bookmarks: 'bookmarks4',
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
  /** Replaces the app's data with a snapshot (from a backup file). */
  restoreSnapshot: (s: Snapshot) => void;
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

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backupDirRef = useRef<Folder | null>(null);
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef({ favorites, wishlist, recents, bookmarks });
  useEffect(() => {
    latest.current = { favorites, wishlist, recents, bookmarks };
  });

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
      const [fav, rec, wish, marks, bdir] = await Promise.all([
        load<Series[]>(KEYS.favorites, []),
        load<Recent[]>(KEYS.recents, []),
        load<Series[]>(KEYS.wishlist, []),
        load<Bookmark[]>(KEYS.bookmarks, []),
        load<Folder | null>(KEYS.backupDir, null),
      ]);
      setBackupDir(bdir);
      backupDirRef.current = bdir;
      setFavorites(fav);
      setRecents(rec);
      setWishlist(wish);
      setBookmarks(marks);
      setReady(true);
    })();
  }, []);

  const toggleFavorite = useCallback((s: Series) => {
    setFavorites((prev) => {
      const next = toggled(prev, s);
      save(KEYS.favorites, next);
      return next;
    });
  }, []);

  const toggleWishlist = useCallback((s: Series) => {
    setWishlist((prev) => {
      const next = toggled(prev, s);
      save(KEYS.wishlist, next);
      return next;
    });
  }, []);

  const addBookmark = useCallback((b: Omit<Bookmark, 'id' | 'ts'>) => {
    const ts = Date.now();
    setBookmarks((prev) => {
      const next = [{ ...b, note: b.note.trim(), id: `${ts}-${Math.random().toString(36).slice(2, 7)}`, ts }, ...prev];
      save(KEYS.bookmarks, next);
      return next;
    });
  }, []);

  const updateBookmark = useCallback((id: string, note: string) => {
    setBookmarks((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, note: note.trim() } : b));
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
    setFavorites(s.favorites);
    setWishlist(s.wishlist);
    setRecents(s.recents);
    setBookmarks(s.bookmarks);
    save(KEYS.favorites, s.favorites);
    save(KEYS.wishlist, s.wishlist);
    save(KEYS.recents, s.recents);
    save(KEYS.bookmarks, s.bookmarks);
  }, []);

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

  // Auto-save shortly after anything changes, and right away when the app leaves the foreground.
  useEffect(() => {
    if (!ready || !backupDir) return;
    const t = setTimeout(() => flushBackup(), 2500);
    return () => clearTimeout(t);
  }, [ready, backupDir, favorites, wishlist, recents, bookmarks, flushBackup]);

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
      restoreSnapshot,
    };
  }, [
    backupDir,
    lastBackup,
    backupError,
    pickBackupFolder,
    enableBackup,
    stopBackup,
    exportBackup,
    restoreSnapshot,
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
