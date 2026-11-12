import { useEffect } from 'react';

import { useUpdater } from '../lib/useUpdater';

/** Looks for a newer build once when the app opens and offers to install it. Renders nothing. */
export function UpdateCheck() {
  const { check } = useUpdater();
  useEffect(() => {
    check(true);
    // Only on launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
