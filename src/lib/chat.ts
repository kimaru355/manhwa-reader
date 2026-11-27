import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import * as api from './api';

export type ChatRoomId = 'global' | 'manga' | 'manhwa' | 'interesting' | 'novel' | 'light-novel';

export type ChatRoom = {
  id: ChatRoomId;
  name: string;
  description: string;
  /** Id of the room's newest message (0 when it has none). */
  latestId: number;
  latestAt: string | null;
};

export type ChatMessage = {
  id: number;
  room: ChatRoomId;
  author: string;
  body: string;
  createdAt: string;
  replyTo: { id: number; author: string; body: string } | null;
  own: boolean;
};

export type ChatPage = { items: ChatMessage[]; hasOlder: boolean; reset: boolean };

/** Shown before the server has answered (or when offline). Everyone lands in Global first. */
export const DEFAULT_ROOMS: ChatRoom[] = [
  { id: 'global', name: 'Global', description: 'Everyone, about anything you are reading.', latestId: 0, latestAt: null },
  { id: 'manga', name: 'Manga', description: 'Japanese comics.', latestId: 0, latestAt: null },
  { id: 'manhwa', name: 'Manhwa', description: 'Korean webtoons and comics.', latestId: 0, latestAt: null },
  { id: 'interesting', name: 'Interesting', description: 'Finds worth sharing: hidden gems, big moments, news.', latestId: 0, latestAt: null },
  { id: 'novel', name: 'Novel', description: 'Web novels and books.', latestId: 0, latestAt: null },
  { id: 'light-novel', name: 'Light novel', description: 'Light novels and their adaptations.', latestId: 0, latestAt: null },
];

/** Not live: the chat screen fetches every 30 s while it is open, after sending, and when Refresh is tapped. */
export const CHAT_POLL_MS = 30_000;
export const CHAT_MAX = 1000;

export const fetchRooms = async () => (await api.publicGet<{ rooms: ChatRoom[] }>('/chat/rooms')).rooms;

export const fetchMessages = (room: ChatRoomId, opts: { after?: number; before?: number } = {}) =>
  api.publicGet<ChatPage>(
    `/chat/messages?room=${room}${opts.after != null ? `&after=${opts.after}` : ''}${opts.before != null ? `&before=${opts.before}` : ''}`,
  );

export const sendMessage = (room: ChatRoomId, body: string, replyTo?: number | null) =>
  api.authed<ChatMessage>('/chat/messages', { body: { room, body: body.trim(), replyTo: replyTo ?? null } });

export const deleteMessage = (id: number) =>
  api.authed(`/chat/messages/${id}`, { method: 'DELETE' }).then(() => undefined);

// ---- "New messages" badge --------------------------------------------------------------------
// The newest message id seen in each room is kept on the phone. A room has news when its newest id is higher.

const SEEN_KEY = 'chatSeen1';
let seen: Partial<Record<ChatRoomId, number>> | null = null;
let unread: ReadonlySet<ChatRoomId> = new Set();
const listeners = new Set<() => void>();

const loadSeen = async () => {
  if (seen) return seen;
  try {
    seen = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '{}') ?? {};
  } catch {
    seen = {};
  }
  return seen!;
};

const setUnread = (next: Set<ChatRoomId>) => {
  if (next.size === unread.size && [...next].every((r) => unread.has(r))) return;
  unread = next;
  listeners.forEach((l) => l());
};

/** Works out which rooms have messages newer than the ones seen. */
export async function applyRooms(rooms: ChatRoom[]) {
  const s = await loadSeen();
  setUnread(new Set(rooms.filter((r) => r.latestId > (s[r.id] ?? 0)).map((r) => r.id)));
}

/** Asks the server for each room's newest message; quiet on failure (it is only for the badge). */
export async function checkChatUnread() {
  try {
    await applyRooms(await fetchRooms());
  } catch {
    // Offline: no badge.
  }
}

/** Records that the reader has seen a room up to message `id`. */
export async function markSeen(room: ChatRoomId, id: number) {
  const s = await loadSeen();
  if ((s[room] ?? 0) >= id && !unread.has(room)) return;
  s[room] = Math.max(s[room] ?? 0, id);
  AsyncStorage.setItem(SEEN_KEY, JSON.stringify(s)).catch(() => {});
  if (unread.has(room)) {
    const next = new Set(unread);
    next.delete(room);
    setUnread(next);
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Rooms with messages the reader hasn't seen yet. */
export const useChatUnread = () => useSyncExternalStore(subscribe, () => unread);
