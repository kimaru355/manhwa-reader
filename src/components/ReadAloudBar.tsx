import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SPEEDS, speedLabel, type Speed, type VoiceOption } from '../lib/readAloud';
import type { ReadAloudStatus } from '../lib/useReadAloud';
import { useTheme } from '../lib/theme';

type Props = {
  status: ReadAloudStatus;
  /** Paragraph being read, 0-based, and how many there are. */
  para?: number;
  total: number;
  canRead: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  /** One chunk (a paragraph or part of a long one) back or forward. */
  onSkip: (delta: -1 | 1) => void;
  onClose: () => void;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  voices: VoiceOption[];
  voice: VoiceOption;
  onVoice: (v: VoiceOption) => void;
  bottomInset: number;
};

/** Novel reader controls for listening: play/pause, stop, speed and voice. */
export function ReadAloudBar(p: Props) {
  const t = useTheme();
  const [showOptions, setShowOptions] = useState(false);
  const playing = p.status === 'playing' || p.status === 'next';
  const canSkip = p.status === 'playing' || p.status === 'paused';

  const label =
    p.status === 'next'
      ? 'Opening the next chapter…'
      : p.para !== undefined
        ? `${p.status === 'paused' ? 'Paused at' : 'Reading'} paragraph ${p.para + 1} of ${p.total}`
        : p.canRead
          ? 'Tap play to listen, or tap a paragraph'
          : 'Nothing to read in this chapter';

  const pill = (on: boolean) => [styles.pill, { borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : 'transparent' }];
  const pillText = (on: boolean) => [styles.pillText, { color: on ? '#fff' : t.text }];

  return (
    <View style={[styles.bar, { backgroundColor: t.card, borderTopColor: t.border, paddingBottom: p.bottomInset + 8 }]}>
      <View style={styles.row}>
        <Text numberOfLines={1} style={[styles.label, { color: t.sub }]}>
          {label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Speed and voice"
          hitSlop={6}
          onPress={() => setShowOptions((s) => !s)}
          style={[styles.chip, { borderColor: showOptions ? t.accent : t.border }]}
        >
          <Text style={{ color: t.text, fontWeight: '600' }}>{speedLabel(p.speed)}</Text>
          <Ionicons name={showOptions ? 'chevron-down' : 'options-outline'} size={16} color={t.sub} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close read aloud" hitSlop={8} onPress={p.onClose}>
          <Ionicons name="close" size={22} color={t.sub} />
        </Pressable>
      </View>

      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Stop reading aloud" hitSlop={8} onPress={p.onStop} disabled={p.status === 'idle'}>
          <Ionicons name="stop" size={22} color={p.status === 'idle' ? t.border : t.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Back a bit" hitSlop={8} disabled={!canSkip} onPress={() => p.onSkip(-1)}>
          <Ionicons name="play-skip-back" size={24} color={canSkip ? t.text : t.border} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause reading aloud' : 'Read aloud'}
          disabled={!p.canRead && !playing}
          onPress={playing ? p.onPause : p.onPlay}
          style={[styles.play, { backgroundColor: t.accent, opacity: p.canRead || playing ? 1 : 0.4 }]}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={24} color="#fff" />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Forward a bit" hitSlop={8} disabled={!canSkip} onPress={() => p.onSkip(1)}>
          <Ionicons name="play-skip-forward" size={24} color={canSkip ? t.text : t.border} />
        </Pressable>
        {/* Keeps the play button centred. */}
        <View style={styles.spacer} />
      </View>

      {showOptions ? (
        <View style={styles.options}>
          <Text style={[styles.heading, { color: t.sub }]}>Speed</Text>
          <View style={styles.speeds}>
            {SPEEDS.map((s) => (
              <Pressable key={s} onPress={() => p.onSpeed(s)} style={[pill(s === p.speed), styles.speed]}>
                <Text style={pillText(s === p.speed)}>{speedLabel(s)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.heading, { color: t.sub }]}>Voice (on this phone, works offline)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.voices}>
            {p.voices.map((v) => {
              const on = v.id === p.voice.id;
              return (
                <Pressable key={v.id ?? 'default'} onPress={() => p.onVoice(v)} style={pill(on)}>
                  <Text style={pillText(on)}>{v.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginTop: 8 },
  spacer: { width: 22 },
  play: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 13 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  options: { marginTop: 10, gap: 8 },
  heading: { fontSize: 12, fontWeight: '600' },
  speeds: { flexDirection: 'row', gap: 6 },
  speed: { flex: 1, alignItems: 'center', paddingHorizontal: 0 },
  voices: { gap: 6, paddingBottom: 2 },
  pill: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 13, fontWeight: '600' },
});
