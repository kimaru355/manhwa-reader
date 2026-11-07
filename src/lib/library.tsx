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
import { scanFolder } from './scanner';
import type { Bookmark, Folder, Manhwa, Recent, Snapshot } from './types';
import { naturalCompare, nameFromUri } from './util';

const KEYS = {
  folders: 'folders',
  // v3: chapter-per-PDF with hashed ids. Older keys held a different shape and are ignored.
  library: 'library3',
  favorites: 'favorites3',
  recents: 'recents3',
  wishlist: 'wishlist3',
  bookmarks: 'bookmarks3',
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

type LibraryContext = {
  ready: boolean;
  folders: Folder[];
  library: Manhwa[];
  favorites: Manhwa[];
  wishlist: Manhwa[];
  recents: { recent: Recent; manhwa: Manhwa }[];
  scanning: boolean;
  scanError: string | null;
  getManhwa: (id: string | undefined) => Manhwa | undefined;
  getProgress: (id: string) => Recent | undefined;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  isWishlisted: (id: string) => boolean;
  toggleWishlist: (id: string) => void;
  /** Bookmarks of one manhwa, ordered by when they were made (newest first). */
  getBookmarks: (manhwaId: string) => Bookmark[];
  addBookmark: (b: Omit<Bookmark, 'id' | 'ts'>) => void;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, note: string) => void;
  addFolder: () => Promise<void>;
  removeFolder: (uri: string) => void;
  rescan: () => Promise<void>;
  saveProgress: (p: Omit<Recent, 'ts'>) => void;
  removeRecent: (id: string) => void;
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
  const [folders, setFolders] = useState<Folder[]>([]);
  const [library, setLibrary] = useState<Manhwa[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentList, setRecentList] = useState<Recent[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [backupDir, setBackupDir] = useState<Folder | null>(null);
  const [lastBackup, setLastBackup] = useState<number | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Mirrors of state for async callbacks that must see the latest value.
  const foldersRef = useRef(folders);
  const libraryRef = useRef(library);
  foldersRef.current = folders;
  libraryRef.current = library;
  const scanningRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backupDirRef = useRef<Folder | null>(null);
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef({ folders, favoriteIds, wishlistIds, recentList, bookmarks });
  useEffect(() => {
    latest.current = { folders, favoriteIds, wishlistIds, recentList, bookmarks };
  });

  const buildSnapshot = (): Snapshot => ({
    app: 'manhwa-reader',
    version: 1,
    savedAt: Date.now(),
    folders: latest.current.folders,
    favorites: latest.current.favoriteIds,
    wishlist: latest.current.wishlistIds,
    recents: latest.current.recentList,
    bookmarks: latest.current.bookmarks,
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

  const rescan = useCallback(async (override?: Folder[]) => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setScanError(null);
    const roots = override ?? foldersRef.current;
    const previous = libraryRef.current;
    const errors: string[] = [];
    const merged: Manhwa[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
      let items: Manhwa[];
      try {
        items = await scanFolder(root);
      } catch (e) {
        errors.push(`${root.name}: access lost — tap Add folder and pick it again`);
        items = previous.filter((m) => m.sourceUri === root.uri);
      }
      for (const m of items) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        merged.push(m);
      }
    }
    merged.sort((a, b) => naturalCompare(a.title, b.title));
    setLibrary(merged);
    save(KEYS.library, merged);
    setScanError(errors.length ? errors.join('\n') : null);
    scanningRef.current = false;
    setScanning(false);
  }, []);

  useEffect(() => {
    (async () => {
      const [f, l, fav, rec, wish, marks, bdir] = await Promise.all([
        load<Folder[]>(KEYS.folders, []),
        load<Manhwa[]>(KEYS.library, []),
        load<string[]>(KEYS.favorites, []),
        load<Recent[]>(KEYS.recents, []),
        load<string[]>(KEYS.wishlist, []),
        load<Bookmark[]>(KEYS.bookmarks, []),
        load<Folder | null>(KEYS.backupDir, null),
      ]);
      setBackupDir(bdir);
      backupDirRef.current = bdir;
      setFolders(f);
      setLibrary(l);
      setFavoriteIds(fav);
      setRecentList(rec);
      setWishlistIds(wish);
      setBookmarks(marks);
      foldersRef.current = f;
      libraryRef.current = l;
      setReady(true);
      if (f.length) rescan(f);
    })();
  }, [rescan]);

  const addFolder = useCallback(async () => {
    const res = await SAF.requestDirectoryPermissionsAsync();
    if (!res.granted) return;
    const uri = res.directoryUri;
    // Already listed (e.g. restored from a backup): access is granted again now, so just rescan.
    if (foldersRef.current.some((f) => f.uri === uri)) {
      await rescan(foldersRef.current);
      return;
    }
    const next = [...foldersRef.current, { uri, name: nameFromUri(uri) || 'Folder' }];
    setFolders(next);
    foldersRef.current = next;
    save(KEYS.folders, next);
    await rescan(next);
  }, [rescan]);

  const removeFolder = useCallback((uri: string) => {
    const next = foldersRef.current.filter((f) => f.uri !== uri);
    const lib = libraryRef.current.filter((m) => m.sourceUri !== uri);
    setFolders(next);
    setLibrary(lib);
    foldersRef.current = next;
    libraryRef.current = lib;
    save(KEYS.folders, next);
    save(KEYS.library, lib);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      save(KEYS.favorites, next);
      return next;
    });
  }, []);

  const toggleWishlist = useCallback((id: string) => {
    setWishlistIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
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
    setRecentList((prev) => {
      const next = [{ ...p, ts: Date.now() }, ...prev.filter((r) => r.manhwaId !== p.manhwaId)].slice(
        0,
        MAX_RECENTS,
      );
      // Page changes fire constantly while scrolling; only hit storage once things settle.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(KEYS.recents, next), 800);
      return next;
    });
  }, []);

  const removeRecent = useCallback((id: string) => {
    setRecentList((prev) => {
      const next = prev.filter((r) => r.manhwaId !== id);
      save(KEYS.recents, next);
      return next;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecentList([]);
    save(KEYS.recents, []);
  }, []);

  const restoreSnapshot = useCallback(
    (s: Snapshot) => {
      setFolders(s.folders);
      foldersRef.current = s.folders;
      // The library is rebuilt by scanning; folders whose access was lost show a prompt to add them again.
      setLibrary([]);
      libraryRef.current = [];
      setFavoriteIds(s.favorites);
      setWishlistIds(s.wishlist);
      setRecentList(s.recents);
      setBookmarks(s.bookmarks);
      save(KEYS.folders, s.folders);
      save(KEYS.library, []);
      save(KEYS.favorites, s.favorites);
      save(KEYS.wishlist, s.wishlist);
      save(KEYS.recents, s.recents);
      save(KEYS.bookmarks, s.bookmarks);
      if (s.folders.length) rescan(s.folders);
    },
    [rescan],
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

  // Auto-save shortly after anything changes, and right away when the app leaves the foreground.
  useEffect(() => {
    if (!ready || !backupDir) return;
    const t = setTimeout(() => flushBackup(), 2500);
    return () => clearTimeout(t);
  }, [ready, backupDir, folders, favoriteIds, wishlistIds, recentList, bookmarks, flushBackup]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && backupDirRef.current) flushBackup();
    });
    return () => sub.remove();
  }, [flushBackup]);

  const value = useMemo<LibraryContext>(() => {
    const byId = new Map(library.map((m) => [m.id, m]));
    const favSet = new Set(favoriteIds);
    const wishSet = new Set(wishlistIds);
    return {
      ready,
      folders,
      library,
      favorites: favoriteIds.map((id) => byId.get(id)).filter((m): m is Manhwa => !!m),
      wishlist: wishlistIds.map((id) => byId.get(id)).filter((m): m is Manhwa => !!m),
      recents: recentList
        .map((recent) => ({ recent, manhwa: byId.get(recent.manhwaId) }))
        .filter((r): r is { recent: Recent; manhwa: Manhwa } => !!r.manhwa),
      scanning,
      scanError,
      getManhwa: (id) => (id ? byId.get(id) : undefined),
      getProgress: (id) => recentList.find((r) => r.manhwaId === id),
      isFavorite: (id) => favSet.has(id),
      toggleFavorite,
      isWishlisted: (id) => wishSet.has(id),
      toggleWishlist,
      getBookmarks: (manhwaId) => bookmarks.filter((b) => b.manhwaId === manhwaId),
      addBookmark,
      removeBookmark,
      updateBookmark,
      addFolder,
      removeFolder,
      rescan: () => rescan(),
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
    folders,
    library,
    favoriteIds,
    recentList,
    wishlistIds,
    bookmarks,
    scanning,
    scanError,
    toggleFavorite,
    toggleWishlist,
    addBookmark,
    removeBookmark,
    updateBookmark,
    addFolder,
    removeFolder,
    rescan,
    saveProgress,
    removeRecent,
    clearRecents,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
