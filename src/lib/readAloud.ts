/**
 * Pure helpers for reading a novel chapter aloud: splitting it into chunks the phone's
 * text-to-speech engine speaks one at a time, the speed choices, and picking voices.
 * No React Native imports, so it runs in the node tests.
 */

export const SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export const speedLabel = (s: Speed) => `${s}x`;

export const parseSpeed = (v: string | null | undefined): Speed => {
  const n = Number(v);
  return (SPEEDS as readonly number[]).includes(n) ? (n as Speed) : 1;
};

/** One piece of speech: a paragraph, or part of a long one. */
export type Chunk = {
  /** Index of the paragraph it comes from. */
  para: number;
  text: string;
  /** Where in the paragraph it starts, 0..1, to scroll inside long paragraphs. */
  at: number;
};

/** Short enough that speed and voice changes kick in quickly, and far under Android's input limit. */
export const CHUNK_MAX = 500;

/** Splits a paragraph at sentence ends (or, failing that, spaces) into pieces of at most `max` characters. */
export function splitText(text: string, max = CHUNK_MAX): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let pos = 0;
  while (pos < text.length) {
    // Skip whitespace between pieces.
    while (pos < text.length && /\s/.test(text[pos])) pos++;
    if (pos >= text.length) break;
    if (text.length - pos <= max) {
      out.push({ text: text.slice(pos).trimEnd(), start: pos });
      break;
    }
    const window = text.slice(pos, pos + max);
    let cut = -1;
    // Last sentence end in the window (".", "!", "?", "…", optionally followed by quotes/brackets).
    const re = /[.!?…]+["'”’)\]]*(?=\s)/g;
    for (let m = re.exec(window); m; m = re.exec(window)) {
      const end = m.index + m[0].length;
      if (end >= max * 0.3) cut = end;
    }
    if (cut < 0) {
      const space = window.lastIndexOf(' ');
      cut = space > max * 0.3 ? space : max;
    }
    out.push({ text: window.slice(0, cut).trimEnd(), start: pos });
    pos += cut;
  }
  return out.filter((p) => p.text.length > 0);
}

/** Turns paragraphs into speech chunks, skipping ones with nothing to say. */
export function toChunks(paras: string[], max = CHUNK_MAX): Chunk[] {
  const chunks: Chunk[] = [];
  paras.forEach((p, para) => {
    if (!/[\p{L}\p{N}]/u.test(p)) return; // "* * *", empty lines
    for (const piece of splitText(p, max)) chunks.push({ para, text: piece.text, at: p.length ? piece.start / p.length : 0 });
  });
  return chunks;
}

/** The first chunk of a paragraph (or the next one that has speech), for starting there. */
export function chunkForPara(chunks: Chunk[], para: number): number {
  const i = chunks.findIndex((c) => c.para >= para);
  return i < 0 ? 0 : i;
}

/** What `expo-speech` reports for a voice. */
export type VoiceInfo = { identifier: string; name: string; language: string; quality: string };

/** A choice in the voice picker; `id` undefined means the phone's default voice. */
export type VoiceOption = { id?: string; language?: string; label: string };

export const DEFAULT_VOICE: VoiceOption = { label: 'Phone default' };

/**
 * Android names voices that stream from Google's servers with "network" (en-us-x-sfg-network);
 * those need a connection, so read aloud only offers the on-device ones.
 */
export const isOfflineVoice = (v: VoiceInfo) => !/network/i.test(v.identifier) && !/network/i.test(v.name);

const norm = (lang: string) => lang.replace('_', '-').toLowerCase();

/** Locales tried first, in order, before other variants of the preferred language. */
const LOCALE_ORDER = ['en-us', 'en-gb', 'en-au', 'en-in', 'en-ca'];

/**
 * Picks up to `n` offline voices: the preferred languages first (in order), the well-known
 * English locales first among those, better quality first, then by name for a stable order.
 * Falls back to any offline voice when none speak a preferred language.
 */
export function pickVoices(voices: VoiceInfo[], preferred: string[] = ['en'], n = 5): VoiceInfo[] {
  const seen = new Set<string>();
  const offline = voices.filter((v) => {
    if (!v.identifier || seen.has(v.identifier) || !isOfflineVoice(v)) return false;
    seen.add(v.identifier);
    return true;
  });
  const prefs = preferred.map(norm);
  const langRank = (v: VoiceInfo) => {
    const l = norm(v.language);
    const exact = prefs.indexOf(l);
    if (exact >= 0) return exact * 2;
    const base = prefs.indexOf(l.split('-')[0]);
    return base >= 0 ? base * 2 + 1 : Number.MAX_SAFE_INTEGER;
  };
  const localeRank = (v: VoiceInfo) => {
    const i = LOCALE_ORDER.indexOf(norm(v.language));
    return i < 0 ? LOCALE_ORDER.length : i;
  };
  const qualityRank = (v: VoiceInfo) => (v.quality === 'Enhanced' ? 0 : 1);
  const sorted = [...offline].sort(
    (a, b) =>
      langRank(a) - langRank(b) ||
      localeRank(a) - localeRank(b) ||
      qualityRank(a) - qualityRank(b) ||
      a.identifier.localeCompare(b.identifier),
  );
  const wanted = sorted.filter((v) => langRank(v) !== Number.MAX_SAFE_INTEGER);
  return (wanted.length ? wanted : sorted).slice(0, n);
}

const LANGS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  id: 'Indonesian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  sw: 'Swahili',
};

/** "English (US)" from "en-US". */
export function languageLabel(lang: string): string {
  const [code, region] = lang.replace('_', '-').split('-');
  const name = LANGS[code?.toLowerCase()] ?? code ?? lang;
  return region ? `${name} (${region.toUpperCase()})` : name;
}

/** Voice picker choices: "English (US) 1", "English (US) 2", "English (GB) 1"…, or the phone default when there are none. */
export function voiceOptions(voices: VoiceInfo[], preferred: string[] = ['en'], n = 5): VoiceOption[] {
  const picked = pickVoices(voices, preferred, n);
  if (!picked.length) return [DEFAULT_VOICE];
  const count = new Map<string, number>();
  return picked.map((v) => {
    const label = languageLabel(v.language);
    const k = (count.get(label) ?? 0) + 1;
    count.set(label, k);
    return { id: v.identifier, language: v.language, label: `${label} ${k}` };
  });
}
