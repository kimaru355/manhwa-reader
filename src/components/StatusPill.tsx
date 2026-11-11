import { Ionicons } from '@expo/vector-icons';
import { BatteryState, useBatteryLevel, useBatteryState } from 'expo-battery';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Small clock + battery readout shown while reading in full screen. */
export function StatusPill({ bottom }: { bottom: number }) {
  const [now, setNow] = useState(() => new Date());
  const level = useBatteryLevel();
  const state = useBatteryState();

  useEffect(() => {
    const tick = () => setNow(new Date());
    // Align to the minute boundary, then update every minute.
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      tick();
      interval = setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const charging = state === BatteryState.CHARGING || state === BatteryState.FULL;
  const pct = level >= 0 ? Math.round(level * 100) : null;
  const icon = charging ? 'battery-charging' : pct !== null && pct <= 15 ? 'battery-dead' : 'battery-full';

  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="none">
      <View style={styles.pill}>
        <Text style={styles.text}>{formatTime(now)}</Text>
        <View style={styles.dot} />
        <Ionicons name={icon} size={14} color={pct !== null && pct <= 15 && !charging ? '#FF6B6B' : '#fff'} />
        <Text style={styles.text}>{pct !== null ? `${pct}%` : '–'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(11,11,13,0.75)',
  },
  text: { color: '#fff', fontSize: 11, fontWeight: '600' },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#777' },
});
