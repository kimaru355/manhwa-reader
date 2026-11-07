import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '../../components/EmptyState';
import { ManhwaGrid } from '../../components/ManhwaGrid';
import { useLibrary } from '../../lib/library';
import { useTheme } from '../../lib/theme';

export default function Wishlist() {
  const t = useTheme();
  const { ready, wishlist } = useLibrary();

  if (!ready) return null;
  if (wishlist.length === 0) {
    return (
      <EmptyState
        icon="star-outline"
        title="Your wishlist is empty"
        message="Tap the star on a manhwa to save it for later: not ready yet, or something to read next."
      />
    );
  }

  return (
    <ManhwaGrid
      data={wishlist}
      header={
        <View style={styles.header}>
          <Text style={{ color: t.sub }}>
            {wishlist.length} to read next
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 4, paddingVertical: 8 },
});
