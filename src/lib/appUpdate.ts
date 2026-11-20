import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import { useSyncExternalStore } from 'react';
import { Alert, AppState } from 'react-native';

import { appInstaller } from './appInstaller';
import { friendly } from './errors';
import { apkUrl, installedBuild, openDownload, type UpdateInfo } from './update';

/**
 * A newer build of the app, downloaded into the app's storage and installed through Android's package installer.
 * Shown at the top of the Downloads tab until it is installed; the new build deletes the file when it first opens.
 */
export type AppUpdate =
  | { status: 'downloading'; info: UpdateInfo; progress: number }
  | { status: 'ready'; info: UpdateInfo; file: string }
  | { status: 'error'; info: UpdateInfo; message: string };

/** Must match the folder shared with the installer in modules/app-installer (res/xml/app_installer_paths.xml). */
const DIR = `${FS.documentDirectory}updates/`;
const KEY = 'appUpdate1';

/** Whether this build downloads and installs updates itself. */
export const installsUpdates = !!appInstaller;

let state: AppUpdate | null = null;
const listeners = new Set<() => void>();
let task: FS.DownloadResumable | null = null;
let running: Promise<boolean> | null = null;

function set(next: AppUpdate | null) {
  state = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The update being downloaded or waiting to be installed, if any. */
export const useAppUpdate = () => useSyncExternalStore(subscribe, () => state);

const exists = (uri: string) =>
  FS.getInfoAsync(uri)
    .then((i) => i.exists)
    .catch(() => false);

const wipe = () => FS.deleteAsync(DIR, { idempotent: true }).catch(() => {});

let loaded: Promise<void> | null = null;

/**
 * Picks up an update downloaded in an earlier session. Once it is installed (this build is that version or newer)
 * its file is deleted.
 */
export function loadAppUpdate() {
  loaded ??= (async () => {
    if (!appInstaller) return;
    let saved: { info: UpdateInfo; file: string } | null = null;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {}
    if (saved && saved.info.versionCode > installedBuild() && (await exists(saved.file))) {
      if (!state) set({ status: 'ready', info: saved.info, file: saved.file });
      return;
    }
    // Installed, or never finished: nothing in the folder is needed any more.
    await AsyncStorage.removeItem(KEY).catch(() => {});
    if (!state) await wipe();
  })();
  return loaded;
}

/**
 * Downloads `info`'s APK (the build this phone needs) unless it is already downloaded. Resolves true once it is
 * ready to install, false if the download failed or was cancelled.
 */
export async function downloadAppUpdate(info: UpdateInfo): Promise<boolean> {
  if (!appInstaller) return false;
  await loadAppUpdate();
  if (state?.info.versionCode === info.versionCode) {
    if (state.status === 'ready' && (await exists(state.file))) return true;
    if (state.status === 'downloading' && running) return running;
  }
  cancelDownload();
  const job = (async () => {
    const file = `${DIR}manhwa-reader-v${info.versionName}.apk`;
    const part = `${file}.part`;
    set({ status: 'downloading', info, progress: 0 });
    try {
      await AsyncStorage.removeItem(KEY).catch(() => {});
      await wipe();
      await FS.makeDirectoryAsync(DIR, { intermediates: true });
      let shown = 0;
      const dl = FS.createDownloadResumable(apkUrl(info, appInstaller.supports64Bit), part, {}, (p) => {
        if (task !== dl || !p.totalBytesExpectedToWrite) return;
        const progress = p.totalBytesWritten / p.totalBytesExpectedToWrite;
        // Redraw about once per percent.
        if (progress - shown >= 0.01 || progress >= 1) {
          shown = progress;
          set({ status: 'downloading', info, progress });
        }
      });
      task = dl;
      const res = await dl.downloadAsync();
      if (task !== dl) return false; // cancelled
      task = null;
      if (!res) throw new Error('The download stopped');
      if (res.status !== 200) throw new Error(res.status === 404 ? 'The update isn’t on the website yet. Try again later.' : `The website answered ${res.status}`);
      await FS.moveAsync({ from: part, to: file });
      await AsyncStorage.setItem(KEY, JSON.stringify({ info, file })).catch(() => {});
      set({ status: 'ready', info, file });
      return true;
    } catch (e) {
      if (state?.info.versionCode === info.versionCode && state.status === 'downloading') {
        task = null;
        await FS.deleteAsync(part, { idempotent: true }).catch(() => {});
        set({ status: 'error', info, message: friendly(e) });
      }
      return false;
    }
  })();
  running = job;
  job.finally(() => {
    if (running === job) running = null;
  });
  return job;
}

function cancelDownload() {
  const dl = task;
  task = null;
  running = null;
  dl?.cancelAsync().catch(() => {});
}

/** Stops the download (or forgets the downloaded update) and deletes its file. The next check starts it again. */
export async function removeAppUpdate() {
  cancelDownload();
  set(null);
  await AsyncStorage.removeItem(KEY).catch(() => {});
  await wipe();
}

/** Opens the package installer once the app comes back from settings with the permission turned on. */
function installOnReturn(file: string) {
  let left = false;
  const sub = AppState.addEventListener('change', (s) => {
    if (s !== 'active') {
      left = true;
      return;
    }
    if (!left) return;
    sub.remove();
    if (appInstaller?.canInstall()) install(file);
  });
  // Don't wait forever if they never come back this way.
  setTimeout(() => sub.remove(), 10 * 60_000);
}

function install(file: string) {
  try {
    appInstaller?.install(file);
  } catch (e) {
    Alert.alert('Couldn’t open the installer', friendly(e));
  }
}

/**
 * Hands the downloaded update to Android's package installer, first asking for the "install unknown apps"
 * permission if the app doesn't have it yet.
 */
export async function installAppUpdate() {
  if (!appInstaller) return openDownload();
  const u = state;
  if (u?.status !== 'ready') return;
  if (!(await exists(u.file))) {
    // Deleted from outside the app: fetch it again.
    if (await downloadAppUpdate(u.info)) installAppUpdate();
    return;
  }
  if (appInstaller.canInstall()) return install(u.file);
  Alert.alert(
    'Allow installing updates',
    'Android needs your permission for Manhwa Reader to install its own updates. Turn on “Allow from this source”, then come back.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Open settings',
        onPress: () => {
          installOnReturn(u.file);
          try {
            appInstaller?.openInstallSettings();
          } catch (e) {
            Alert.alert('Couldn’t open settings', friendly(e));
          }
        },
      },
    ],
  );
}
