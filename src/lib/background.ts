import { PermissionsAndroid, Platform } from 'react-native';
import BackgroundService from 'react-native-background-actions';

/**
 * Keeps the app alive while chapters download, so you can switch to another app. Android shows a
 * notification for as long as this runs; it is removed when the queue finishes or is paused.
 */
let release: (() => void) | null = null;
let active = false;
let starting: Promise<void> | null = null;
let lastUpdate = 0;
let asked = false;

const supported = Platform.OS === 'android';

export function startBackground(text: string) {
  if (!supported || active) return;
  active = true;
  starting = begin(text).finally(() => {
    starting = null;
  });
}

async function begin(text: string) {
  try {
    if (!asked && Number(Platform.Version) >= 33) {
      asked = true;
      await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS');
    }
    await BackgroundService.start(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      {
        taskName: 'downloads',
        taskTitle: 'Downloading chapters',
        taskDesc: text,
        taskIcon: { name: 'ic_launcher', type: 'mipmap' },
        color: '#B76CF0',
        linkingURI: 'manhwareader://',
        foregroundServiceType: ['dataSync'],
        progressBar: { max: 100, value: 0, indeterminate: true },
      },
    );
  } catch {
    // Downloads still run while the app is open if the service can't start.
    active = false;
    release = null;
  }
}

/** Updates the notification (at most once a second). */
export function updateBackground(text: string, done: number, total: number) {
  if (!supported || !active) return;
  const now = Date.now();
  if (now - lastUpdate < 1000) return;
  lastUpdate = now;
  BackgroundService.updateNotification({
    taskDesc: text,
    progressBar: total ? { max: total, value: done } : { max: 100, value: 0, indeterminate: true },
  }).catch(() => {});
}

export async function stopBackground() {
  if (!supported || !active) return;
  active = false;
  await starting;
  const r = release;
  release = null;
  r?.();
  await BackgroundService.stop().catch(() => {});
}
