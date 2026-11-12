import * as Application from 'expo-application';
import * as FS from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';

import { API_BASE_URL } from './config';
import { FriendlyError, friendly } from './errors';

const APK_URL = `${API_BASE_URL}/manhwa-reader.apk`;
const VERSION_URL = `${API_BASE_URL}/version.json`;

export type UpdateInfo = { versionCode: number; versionName: string; notes?: string };

/** Build number of the installed app (Android versionCode). */
export const installedBuild = () => Number(Application.nativeBuildVersion) || 0;
export const installedName = () => Application.nativeApplicationVersion ?? '';

/** Whether this build can install updates itself (Android only). */
export const canSelfUpdate = Platform.OS === 'android';

/** Asks the site for the newest build. Returns it only when it is newer than the installed one. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!canSelfUpdate) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`answered ${res.status}`);
    const info = (await res.json()) as Partial<UpdateInfo>;
    if (typeof info.versionCode !== 'number') throw new Error('bad version file');
    return info.versionCode > installedBuild() ? (info as UpdateInfo) : null;
  } catch (e) {
    throw new FriendlyError(friendly(e));
  } finally {
    clearTimeout(timer);
  }
}

/** Downloads the new APK and hands it to Android's installer. */
export async function installUpdate(onProgress?: (fraction: number) => void): Promise<void> {
  const dest = `${FS.cacheDirectory}manhwa-reader-update.apk`;
  await FS.deleteAsync(dest, { idempotent: true }).catch(() => {});
  try {
    const dl = FS.createDownloadResumable(`${APK_URL}?t=${Date.now()}`, dest, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    });
    const res = await dl.downloadAsync();
    if (!res || res.status !== 200) throw new Error(`answered ${res?.status ?? 'nothing'}`);
    const uri = await FS.getContentUriAsync(dest);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: uri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive',
    });
  } catch (e) {
    throw new FriendlyError(friendly(e));
  }
}
