import * as Application from 'expo-application';
import { Linking, Platform } from 'react-native';

import { API_BASE_URL } from './config';
import { FriendlyError, friendly } from './errors';

/** The website's download page, which offers the build for most phones and the one for older (32-bit) phones. */
const DOWNLOAD_URL = `${API_BASE_URL}/download`;
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

/** Opens the download page in the browser; the person picks and installs the new build from there. */
export const openDownload = () => Linking.openURL(DOWNLOAD_URL).catch(() => {});
