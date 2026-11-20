import { useEffect } from 'react';

import { loadAppUpdate } from '../lib/appUpdate';
import { useUpdater } from '../lib/useUpdater';

/**
 * When the app opens: deletes an update that has since been installed, then looks for a newer build, downloads it
 * and offers to install it. Renders nothing.
 */
export function UpdateCheck() {
  const { check } = useUpdater();
  useEffect(() => {
    loadAppUpdate().then(() => check(true));
    // Only on launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
