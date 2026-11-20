import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { downloadAppUpdate, installAppUpdate, installsUpdates } from './appUpdate';
import { friendly } from './errors';
import { canSelfUpdate, checkForUpdate, openDownload, type UpdateInfo } from './update';

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'error'; message: string };

const label = (info: UpdateInfo) => info.versionName || String(info.versionCode);

/** Offers to install a downloaded update. */
const askInstall = (info: UpdateInfo) =>
  Alert.alert('Update ready', `Version ${label(info)} is downloaded and ready to install.${info.notes ? `\n\n${info.notes}` : ''}`, [
    { text: 'Later', style: 'cancel' },
    { text: 'Install', onPress: () => installAppUpdate() },
  ]);

/**
 * Checks the site for a newer build, downloads it (it shows at the top of the Downloads tab) and offers to install
 * it. Builds without the installer module link to the website instead. `quiet` checks say nothing unless there
 * is an update ready.
 */
export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });

  const check = useCallback(async (quiet = false) => {
    if (!canSelfUpdate) return;
    setState({ kind: 'checking' });
    let info: UpdateInfo | null;
    try {
      info = await checkForUpdate();
    } catch (e) {
      setState(quiet ? { kind: 'idle' } : { kind: 'error', message: friendly(e) });
      return;
    }
    if (!info) return setState({ kind: 'current' });
    setState({ kind: 'available', info });
    if (!installsUpdates) {
      const i = info;
      Alert.alert('Update available', `Version ${label(i)} is ready.${i.notes ? `\n\n${i.notes}` : ''}`, [
        { text: 'Later', style: 'cancel' },
        { text: 'Get it', onPress: openDownload },
      ]);
      return;
    }
    // A failed download shows in the Downloads tab (and in Settings), where it can be retried.
    if (await downloadAppUpdate(info)) askInstall(info);
  }, []);

  return { state, check };
}
