import { AppState, PermissionsAndroid, Platform } from 'react-native';
import BackgroundService from 'react-native-background-actions';

/**
 * Keeps the app alive while chapters download, so you can switch to another app. Android shows a
 * notification for as long as this runs; it is removed when the queue finishes or is paused.
 */
let release: (() => void) | null = null;
let active = false;
let starting: Promise<void> | null = null;
/** A stop that has not finished yet; a new start waits for it so the two never overlap. */
let stopping: Promise<void> | null = null;
let lastUpdate = 0;
let asked = false;

const supported = Platform.OS === 'android';

/**
 * From Android 15 a "data sync" service may run for 6 hours a day while the app is in the background; when
 * that runs out Android stops the app with an error unless the service has already stopped. Opening the app
 * resets the allowance. So the time the service spends running in the background is counted here, and the
 * downloads stop using it a little before the limit (see backgroundTimeUp).
 */
const LIMIT_MS = 5.5 * 60 * 60 * 1000;
const limited = supported && Number(Platform.Version) >= 35;
/** Background service time used since the app was last on screen, not counting the stretch in progress. */
let spentMs = 0;
/** When the stretch in progress began: the service is running and the app is not on screen. */
let countingFrom: number | null = null;

function recount() {
  const now = Date.now();
  if (countingFrom !== null) spentMs += now - countingFrom;
  countingFrom = active && AppState.currentState !== 'active' ? now : null;
}

if (limited) {
  AppState.addEventListener('change', (state) => {
    recount();
    if (state === 'active') spentMs = 0;
  });
}

/** True when the day's background allowance is (nearly) used up; the app must be opened before using it again. */
export const backgroundTimeUp = () => limited && spentMs + (countingFrom !== null ? Date.now() - countingFrom : 0) >= LIMIT_MS;

export function startBackground(text: string) {
  if (!supported || active) return;
  active = true;
  recount();
  starting = begin(text).finally(() => {
    starting = null;
  });
}

async function begin(text: string) {
  await stopping;
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
    recount();
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

export function stopBackground(): Promise<void> {
  if (!supported || !active) return stopping ?? Promise.resolve();
  active = false;
  recount();
  let finish!: () => void;
  const done = new Promise<void>((resolve) => (finish = resolve));
  stopping = done;
  (async () => {
    await starting;
    const r = release;
    release = null;
    r?.();
    await BackgroundService.stop().catch(() => {});
    if (stopping === done) stopping = null;
    finish();
  })();
  return done;
}
