import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ToastAndroid } from 'react-native';

import { hideMediaControls, onMediaAction, showMediaControls } from './readAloudMedia';
import { chunkForPara, DEFAULT_VOICE, parseSpeed, toChunks, voiceOptions, type Speed, type VoiceOption } from './readAloud';

const SPEED_KEY = 'readAloudSpeed1';
const VOICE_KEY = 'readAloudVoice1';

/** `next` = the chapter ended and the next one is loading; reading carries on when it arrives. */
export type ReadAloudStatus = 'idle' | 'playing' | 'paused' | 'next';

type Options = {
  /** The chapter's paragraphs, or null while it loads. */
  paras: string[] | null;
  /** Shown in the media notification: the chapter, and the title it belongs to. */
  chapterName: string;
  seriesTitle: string;
  /** Called when the chapter has been read to the end. Return true if a next chapter is opening. */
  onChapterEnd: () => boolean;
};

/**
 * Reads the chapter aloud with the phone's own text-to-speech engine (offline voices only),
 * one chunk at a time so the screen can follow along and speed or voice changes apply from
 * the current chunk. Android has no pause, so pausing stops and resuming restarts that chunk.
 * While reading, a media notification (lock screen, headset buttons) offers previous / play-pause / next,
 * which move by chunk, and keeps the app running with the screen off.
 */
export function useReadAloud({ paras, chapterName, seriesTitle, onChapterEnd }: Options) {
  const chunks = useMemo(() => (paras ? toChunks(paras) : []), [paras]);
  const [status, setStatus] = useState<ReadAloudStatus>('idle');
  const [pos, setPos] = useState(0);
  const [speed, setSpeedState] = useState<Speed>(1);
  const [voices, setVoices] = useState<VoiceOption[]>([DEFAULT_VOICE]);
  const [voiceId, setVoiceIdState] = useState<string | undefined>(undefined);

  // Callbacks read the latest values from refs; `gen` drops events from utterances that were stopped.
  const gen = useRef(0);
  const posRef = useRef(0);
  const chunksRef = useRef(chunks);
  const speedRef = useRef(speed);
  const voiceRef = useRef<VoiceOption>(DEFAULT_VOICE);
  const endRef = useRef(onChapterEnd);
  const continuing = useRef(false);
  // The engine's stop is async: new speech waits for it so it isn't cut off by a late stop.
  const stopping = useRef<Promise<void>>(Promise.resolve());
  /** A voice that failed to speak; the phone default stands in for it until another is picked. */
  const badVoice = useRef<string | undefined>(undefined);
  useEffect(() => {
    endRef.current = onChapterEnd;
  });

  const voice = voices.find((v) => v.id === voiceId) ?? voices[0];
  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  // Saved speed and voice, and the phone's voices.
  useEffect(() => {
    let alive = true;
    AsyncStorage.multiGet([SPEED_KEY, VOICE_KEY])
      .then(([[, s], [, v]]) => {
        if (!alive) return;
        const sp = parseSpeed(s);
        speedRef.current = sp;
        setSpeedState(sp);
        if (v) setVoiceIdState(v);
      })
      .catch(() => {});
    Speech.getAvailableVoicesAsync()
      .then((list) => {
        if (alive) setVoices(voiceOptions(list));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const moveTo = (i: number) => {
    posRef.current = i;
    setPos(i);
  };

  const halt = useCallback(() => {
    gen.current++;
    stopping.current = Speech.stop().catch(() => {});
  }, []);

  // Speech callbacks start over through this ref (a callback can't name itself).
  const again = useRef<(i: number) => void>(() => {});
  /**
   * Reads from chunk `i`. The engine always has the next sentence queued behind the one being read, so there
   * is no pause between them; `onStart` says which one is being heard.
   */
  const speakFrom = useCallback(
    (i: number) => {
      const my = ++gen.current;
      const list = chunksRef.current;
      if (i >= list.length) {
        moveTo(0);
        if (list.length && endRef.current()) {
          continuing.current = true;
          setStatus('next');
        } else {
          setStatus('idle');
        }
        return;
      }
      moveTo(i);
      setStatus('playing');
      const chosen = voiceRef.current;
      const v = chosen.id && chosen.id === badVoice.current ? DEFAULT_VOICE : chosen;
      const say = (j: number) => {
        if (j >= list.length) return;
        Speech.speak(list[j].text, {
          rate: speedRef.current,
          voice: v.id,
          language: v.language ?? 'en',
          onStart: () => {
            if (gen.current === my) moveTo(j);
          },
          onDone: () => {
            if (gen.current !== my) return;
            if (j >= list.length - 1) again.current(list.length); // the chapter is done
            else say(j + 2);
          },
          onError: () => {
            if (gen.current !== my) return;
            // A chosen voice can fail if its data was removed; use the phone default for it from now on.
            if (v.id) {
              badVoice.current = v.id;
              halt();
              again.current(j);
              return;
            }
            halt();
            setStatus('paused');
            if (Platform.OS === 'android') {
              ToastAndroid.show("Read aloud stopped. Check Text-to-speech in your phone's settings.", ToastAndroid.LONG);
            }
          },
        });
      };
      stopping.current.then(() => {
        if (gen.current !== my) return;
        say(i);
        say(i + 1);
      });
    },
    [halt],
  );

  useEffect(() => {
    again.current = speakFrom;
  }, [speakFrom]);

  // A new chapter: stop, and carry on from its start if the last one was read to the end.
  useEffect(() => {
    chunksRef.current = chunks;
    if (!paras) return; // still loading
    halt();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    moveTo(0);
    if (continuing.current && chunks.length) {
      continuing.current = false;
      speakFrom(0);
    } else {
      continuing.current = false;
      setStatus('idle');
    }
  }, [chunks, paras, halt, speakFrom]);

  // Stop when leaving the screen.
  useEffect(
    () => () => {
      gen.current++;
      continuing.current = false;
      Speech.stop().catch(() => {});
      hideMediaControls();
    },
    [],
  );

  const play = useCallback(
    (fromPara?: number) => {
      halt();
      speakFrom(fromPara === undefined ? posRef.current : chunkForPara(chunksRef.current, fromPara));
    },
    [halt, speakFrom],
  );

  const pause = useCallback(() => {
    halt();
    continuing.current = false;
    setStatus('paused');
  }, [halt]);

  const stop = useCallback(() => {
    halt();
    continuing.current = false;
    moveTo(0);
    setStatus('idle');
  }, [halt]);

  /** Moves one chunk back or forward; keeps playing if it was, stays paused if it was. */
  const skip = useCallback(
    (delta: -1 | 1) => {
      if (status !== 'playing' && status !== 'paused') return;
      const to = Math.max(0, posRef.current + delta);
      if (status === 'playing') {
        halt();
        speakFrom(to);
      } else if (to < chunksRef.current.length) {
        moveTo(to);
      }
    },
    [status, halt, speakFrom],
  );

  // The media notification follows what is happening; it goes away when reading stops.
  const total = paras?.length ?? 0;
  const atPara = status === 'idle' || status === 'next' ? undefined : chunks[pos]?.para;
  useEffect(() => {
    if (status === 'idle') {
      hideMediaControls();
      return;
    }
    const where = status === 'next' ? 'Opening the next chapter…' : atPara !== undefined ? `Paragraph ${atPara + 1} of ${total}` : '';
    showMediaControls(chapterName, [seriesTitle, where].filter(Boolean).join(' · '), status === 'playing' || status === 'next');
  }, [status, atPara, total, chapterName, seriesTitle]);

  // Notification, lock screen and headset buttons.
  const controls = useRef({ play: () => {}, pause: () => {}, skip: (_: -1 | 1) => {}, stop: () => {} });
  useEffect(() => onMediaAction((a) => {
    const c = controls.current;
    if (a === 'play') c.play();
    else if (a === 'pause') c.pause();
    else if (a === 'next') c.skip(1);
    else if (a === 'prev') c.skip(-1);
    else c.stop();
  }), []);

  /** Restarts the current chunk so a new setting is heard right away. */
  const restartIfPlaying = useCallback(() => {
    if (status === 'playing') {
      halt();
      speakFrom(posRef.current);
    }
  }, [status, halt, speakFrom]);

  const setSpeed = useCallback(
    (s: Speed) => {
      speedRef.current = s;
      setSpeedState(s);
      AsyncStorage.setItem(SPEED_KEY, String(s)).catch(() => {});
      restartIfPlaying();
    },
    [restartIfPlaying],
  );

  const setVoice = useCallback(
    (v: VoiceOption) => {
      voiceRef.current = v;
      badVoice.current = undefined;
      setVoiceIdState(v.id);
      if (v.id) AsyncStorage.setItem(VOICE_KEY, v.id).catch(() => {});
      else AsyncStorage.removeItem(VOICE_KEY).catch(() => {});
      restartIfPlaying();
    },
    [restartIfPlaying],
  );

  useEffect(() => {
    controls.current = { play: () => play(), pause, skip, stop };
  });

  const current = status === 'idle' || status === 'next' ? undefined : chunks[pos];
  return {
    status,
    /** Paragraph being read (or paused on), if any. */
    para: current?.para,
    /** Where in that paragraph, 0..1. */
    at: current?.at ?? 0,
    /** The sentence (or phrase) being read: its characters in that paragraph. */
    range: current ? { start: current.start, end: current.end } : undefined,
    canRead: chunks.length > 0,
    play,
    pause,
    stop,
    skip,
    speed,
    setSpeed,
    voices,
    voice,
    setVoice,
  };
}
