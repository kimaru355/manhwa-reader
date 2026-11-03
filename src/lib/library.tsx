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

import { scanFolder } from './scanner';
import type { Folder, Manhwa, Recent } from './types';
import { naturalCompare, nameFromUri } from './util';

const KEYS = {
  folders: 'folders',
  library: 'library',
  favorites: 'favorites',
  recents: 'recents',
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
  recents: { recent: Recent; manhwa: Manhwa }[];
  scanning: boolean;
  scanError: string | null;
  getManhwa: (id: string | undefined) => Manhwa | undefined;
  getProgress: (id: string) => Recent | undefined;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  addFolder: () => Promise<void>;
  removeFolder: (uri: string) => void;
  rescan: () => Promise<void>;
  saveProgress: (p: Omit<Recent, 'ts'>) => void;
  removeRecent: (id: string) => void;
  clearRecents: () => void;
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
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Mirrors of state for async callbacks that must see the latest value.
  const foldersRef = useRef(folders);
  const libraryRef = useRef(library);
  foldersRef.current = folders;
  libraryRef.current = library;
  const scanningRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        errors.push(`${root.name}: access lost — remove it and add it again`);
        items = previous.filter((m) => m.sourceUri === root.uri);
      }
      for (const m of items) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          merged.push(m);
        }
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
      const [f, l, fav, rec] = await Promise.all([
        load<Folder[]>(KEYS.folders, []),
        load<Manhwa[]>(KEYS.library, []),
        load<string[]>(KEYS.favorites, []),
        load<Recent[]>(KEYS.recents, []),
      ]);
      setFolders(f);
      setLibrary(l);
      setFavoriteIds(fav);
      setRecentList(rec);
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
    if (foldersRef.current.some((f) => f.uri === uri)) return;
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

  const value = useMemo<LibraryContext>(() => {
    const byId = new Map(library.map((m) => [m.id, m]));
    const favSet = new Set(favoriteIds);
    return {
      ready,
      folders,
      library,
      favorites: favoriteIds.map((id) => byId.get(id)).filter((m): m is Manhwa => !!m),
      recents: recentList
        .map((recent) => ({ recent, manhwa: byId.get(recent.manhwaId) }))
        .filter((r): r is { recent: Recent; manhwa: Manhwa } => !!r.manhwa),
      scanning,
      scanError,
      getManhwa: (id) => (id ? byId.get(id) : undefined),
      getProgress: (id) => recentList.find((r) => r.manhwaId === id),
      isFavorite: (id) => favSet.has(id),
      toggleFavorite,
      addFolder,
      removeFolder,
      rescan: () => rescan(),
      saveProgress,
      removeRecent,
      clearRecents,
    };
  }, [
    ready,
    folders,
    library,
    favoriteIds,
    recentList,
    scanning,
    scanError,
    toggleFavorite,
    addFolder,
    removeFolder,
    rescan,
    saveProgress,
    removeRecent,
    clearRecents,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
