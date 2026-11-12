import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { friendly } from './errors';
import { canSelfUpdate, checkForUpdate, openDownload, type UpdateInfo } from './update';

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'error'; message: string };

/** Checks the site for a newer build and links to its download. `quiet` checks say nothing unless there is an update. */
export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });

  const ask = useCallback(
    (info: UpdateInfo) =>
      Alert.alert(
        'Update available',
        `Version ${info.versionName || info.versionCode} is ready.${info.notes ? `\n\n${info.notes}` : ''}`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Download', onPress: openDownload },
        ],
      ),
    [],
  );

  const check = useCallback(
    async (quiet = false) => {
      if (!canSelfUpdate) return;
      setState({ kind: 'checking' });
      try {
        const info = await checkForUpdate();
        if (info) {
          setState({ kind: 'available', info });
          ask(info);
        } else setState({ kind: 'current' });
      } catch (e) {
        setState(quiet ? { kind: 'idle' } : { kind: 'error', message: friendly(e) });
      }
    },
    [ask],
  );

  return { state, check };
}
