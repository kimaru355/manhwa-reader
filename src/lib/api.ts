import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { API_BASE_URL } from './config';
import { FriendlyError, friendly } from './errors';

export type Session = {
  accessToken: string;
  /** Opaque; only ever sent back to the refresh and sign-out calls. */
  refreshToken: string;
  /** Unix seconds. */
  expiresAt: number;
  user: { id: string; email: string };
};

const SECURE_KEY = 'session3';
const LEGACY_KEY = 'session2';
const TIMEOUT_MS = 20_000;

let session: Session | null = null;
let loaded = false;

type Failure = FriendlyError & { status?: number };

async function call(
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (res.status === 204) return null;
    const text = await res.text();
    let body: { error?: { message?: string } } | null = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON (for example a gateway error page).
    }
    if (!res.ok) {
      // The server's messages are written for readers; anything else gets the generic wording.
      const msg = body?.error?.message;
      const err: Failure = new FriendlyError(msg ?? friendly(new Error(`answered ${res.status}`)));
      err.status = res.status;
      throw err;
    }
    return body;
  } catch (e) {
    if (e instanceof FriendlyError) throw e;
    throw new FriendlyError(friendly(e));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The login lives in the device keystore (SecureStore), which Android leaves out of backups. If the keystore
 * refuses it, the login is kept in memory only: the reader stays signed in until the app closes.
 */
async function store(next: Session | null) {
  session = next;
  loaded = true;
  if (next) await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(next)).catch(() => {});
  else await SecureStore.deleteItemAsync(SECURE_KEY).catch(() => {});
}

let loading: Promise<Session | null> | null = null;

export function loadSession(): Promise<Session | null> {
  if (loaded) return Promise.resolve(session);
  loading ??= (async () => {
    let found: Session | null = null;
    let legacy = false;
    try {
      const raw = await SecureStore.getItemAsync(SECURE_KEY);
      if (raw) found = JSON.parse(raw) as Session;
      else {
        // Builds before 1.3.1 kept the login in AsyncStorage: move it into the keystore once.
        const old = await AsyncStorage.getItem(LEGACY_KEY).catch(() => null);
        found = old ? (JSON.parse(old) as Session) : null;
        legacy = !!found;
      }
    } catch {
      found = null;
    }
    // A sign-in or sign-out that happened while reading wins over what was on disk.
    if (!loaded) {
      session = found;
      loaded = true;
      if (legacy) await store(found);
    }
    await AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
    return session;
  })();
  return loading;
}

/** `needsConfirmation` means the email must be confirmed before signing in. */
export async function signUp(email: string, password: string) {
  const res = (await call('/auth/signup', { body: { email, password } })) as {
    needsConfirmation: boolean;
    session?: Session;
  };
  if (res.session) await store(res.session);
  return { needsConfirmation: res.needsConfirmation, session: res.session ?? null };
}

export async function signIn(email: string, password: string): Promise<Session> {
  const res = (await call('/auth/signin', { body: { email, password } })) as { session: Session };
  await store(res.session);
  return res.session;
}

export async function signOut() {
  const refreshToken = session?.refreshToken;
  await store(null);
  if (refreshToken) await call('/auth/signout', { body: { refreshToken } }).catch(() => {});
}

/** Always succeeds from the reader's point of view, so nobody can probe which emails have accounts. */
export const forgotPassword = (email: string) => call('/auth/forgot', { body: { email } }).then(() => undefined);

/** The refresh in progress, shared by every call that needs one so only one request is ever made at a time. */
let refreshing: Promise<Session> | null = null;

async function freshSession(force = false): Promise<Session> {
  const s = await loadSession();
  if (!s) throw new FriendlyError('Sign in to do that.');
  if (!force && s.expiresAt - 60 > Date.now() / 1000) return s;
  refreshing ??= (async () => {
    try {
      const res = (await call('/auth/refresh', { body: { refreshToken: s.refreshToken } })) as { session: Session };
      // Signed out (or in as someone else) while this was running: don't bring the old login back.
      if (session?.refreshToken !== s.refreshToken) throw new FriendlyError('Sign in to do that.');
      await store(res.session);
      return res.session;
    } catch (e) {
      // A rejected refresh means the login is over; being offline must not log anyone out.
      const status = (e as Failure).status;
      if ((status === 400 || status === 401) && session?.refreshToken === s.refreshToken) {
        await store(null);
        throw new FriendlyError('Your session ended. Please sign in again.');
      }
      throw e;
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Calls a signed-in endpoint, refreshing the access token when needed. */
export async function authed<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const run = async (force: boolean) => {
    const s = await freshSession(force);
    return call(path, { ...init, token: s.accessToken });
  };
  try {
    return (await run(false)) as T;
  } catch (e) {
    if ((e as Failure).status === 401) return (await run(true)) as T;
    throw e;
  }
}

/** A public endpoint. With a login the server can add per-reader details (such as which items you voted for). */
export async function publicGet<T>(path: string): Promise<T> {
  if (await loadSession()) {
    try {
      return await authed<T>(path);
    } catch (e) {
      // An ended login should not stop public pages from loading.
      if ((e as Failure).status !== 401 && !(e instanceof FriendlyError && /session ended/i.test(e.message))) throw e;
    }
  }
  return (await call(path)) as T;
}

export async function deleteAccount() {
  await authed('/me', { method: 'DELETE' });
  await store(null);
}
