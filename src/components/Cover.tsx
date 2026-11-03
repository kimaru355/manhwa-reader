import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useCover } from '../lib/covers';
import { useTheme } from '../lib/theme';
import type { Manhwa } from '../lib/types';

export function Cover({ manhwa, style }: { manhwa: Manhwa; style?: StyleProp<ViewStyle> }) {
  const uri = useCover(manhwa);
  const t = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: t.card }, style]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <Text style={[styles.letter, { color: t.sub }]}>{manhwa.title.charAt(0).toUpperCase()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 6, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 32, fontWeight: '700' },
});
