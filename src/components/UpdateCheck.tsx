import { useEffect } from 'react';

import { loadAppUpdate } from '../lib/appUpdate';
import { checkChatUnread } from '../lib/chat';
import { useUpdater } from '../lib/useUpdater';

/**
 * When the app opens: deletes an update that has since been installed, then looks for a newer build, downloads it
 * and offers to install it. Renders nothing.
 */
export function UpdateCheck() {
  const { check } = useUpdater();
  useEffect(() => {
    loadAppUpdate().then(() => check(true));
    // Alongside the update check: are there chat messages the reader hasn't seen? (Shows a badge on Chat.)
    checkChatUnread();
    // Only on launch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
