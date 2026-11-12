import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { friendly } from './errors';
import { canSelfUpdate, checkForUpdate, installUpdate, type UpdateInfo } from './update';

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloading'; info: UpdateInfo; progress: number }
  | { kind: 'error'; message: string };

/** Checks the site for a newer build and installs it. `quiet` checks say nothing unless there is an update. */
export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });

  const install = useCallback(async (info: UpdateInfo) => {
    setState({ kind: 'downloading', info, progress: 0 });
    try {
      await installUpdate((progress) => setState({ kind: 'downloading', info, progress }));
      setState({ kind: 'available', info });
    } catch (e) {
      setState({ kind: 'error', message: friendly(e) });
    }
  }, []);

  const ask = useCallback(
    (info: UpdateInfo) =>
      Alert.alert(
        'Update available',
        `Version ${info.versionName || info.versionCode} is ready.${info.notes ? `\n\n${info.notes}` : ''}`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Update now', onPress: () => install(info) },
        ],
      ),
    [install],
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

  return { state, check, install };
}
