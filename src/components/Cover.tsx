import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useDownloads } from '../lib/downloads';
import { coverOf, imageHeaders } from '../lib/sources';
import { useTheme } from '../lib/theme';
import type { Series } from '../lib/types';

export function Cover({ series, style }: { series: Series; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const { getDownloaded } = useDownloads();
  const local = getDownloaded(series.key)?.cover;
  const uri = local ?? coverOf(series);
  // An address that failed shows the title's letter instead of an empty box.
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <View style={[styles.box, { backgroundColor: t.card }, style]}>
      {uri && failed !== uri ? (
        <Image
          source={{ uri, headers: local ? undefined : imageHeaders(series) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          onError={() => setFailed(uri)}
        />
      ) : (
        <Text style={[styles.letter, { color: t.sub }]}>{series.title.charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 32, fontWeight: '700' },
});
