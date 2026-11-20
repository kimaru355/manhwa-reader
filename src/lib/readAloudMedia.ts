import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** A button pressed in the read aloud notification, on the lock screen, or on a headset. */
export type MediaAction = 'play' | 'pause' | 'next' | 'prev' | 'stop';

type Events = { onAction(event: { action: MediaAction }): void };

declare class ReadAloudMediaModule extends NativeModule<Events> {
  show(title: string, text: string, playing: boolean): void;
  hide(): void;
}

/**
 * The app's own native module (modules/read-aloud-media). Missing in builds made before it was added, and
 * off Android; then read aloud works without the notification.
 */
const native = Platform.OS === 'android' ? requireOptionalNativeModule<ReadAloudMediaModule>('ReadAloudMedia') : null;

/** Shows (or updates) the media notification. While it shows, reading goes on with the screen off. */
export function showMediaControls(title: string, text: string, playing: boolean) {
  try {
    native?.show(title, text, playing);
  } catch {}
}

export function hideMediaControls() {
  try {
    native?.hide();
  } catch {}
}

/** Calls `fn` for every control pressed; returns the unsubscribe function. */
export function onMediaAction(fn: (action: MediaAction) => void): () => void {
  const sub = native?.addListener('onAction', (e) => fn(e.action));
  return () => sub?.remove();
}
