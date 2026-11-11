import { Platform, ToastAndroid } from 'react-native';

/** An error whose message is already fit to show to the reader. */
export class FriendlyError extends Error {}

const OFFLINE = "Couldn't connect. Check your internet connection and try again.";

/** Turns anything thrown into a short sentence for the reader; technical messages never leak through. */
export function friendly(e: unknown): string {
  if (e instanceof FriendlyError) return e.message;
  const msg = String((e as Error)?.message ?? e ?? '');
  if (/network request failed|failed to fetch|unknownhost|unable to resolve|timed? ?out|abort|offline|econn|enotfound|socket|ssl|connect/i.test(msg)) {
    return OFFLINE;
  }
  const status = msg.match(/answered (\d{3})/)?.[1];
  if (status === '429') return 'Too many requests. Wait a moment and try again.';
  if (status) return "The site isn't responding right now. Try again later.";
  return 'Something went wrong. Please try again.';
}

let shown = false;
let lastShown = 0;

/** Shows one toast per failure streak; a successful request re-arms it. */
export function toastError(e: unknown) {
  const now = Date.now();
  if (shown || now - lastShown < 8000) return;
  shown = true;
  lastShown = now;
  if (Platform.OS === 'android') ToastAndroid.show(friendly(e), ToastAndroid.LONG);
}

export const fetchSucceeded = () => {
  shown = false;
};
