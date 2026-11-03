import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '../../components/EmptyState';
import { ManhwaGrid } from '../../components/ManhwaGrid';
import { useLibrary } from '../../lib/library';
import { useTheme } from '../../lib/theme';

export default function Favorites() {
  const t = useTheme();
  const { ready, favorites } = useLibrary();

  if (!ready) return null;
  if (favorites.length === 0) {
    return (
      <EmptyState
        icon="heart-outline"
        title="No favorites yet"
        message="Tap the heart on a manhwa to keep it here."
      />
    );
  }

  return (
    <ManhwaGrid
      data={favorites}
      header={
        <View style={styles.header}>
          <Text style={{ color: t.sub }}>
            {favorites.length} manhwa{favorites.length === 1 ? '' : 's'}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 4, paddingVertical: 8 },
});
