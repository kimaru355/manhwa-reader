import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '../../components/EmptyState';
import { ManhwaGrid } from '../../components/ManhwaGrid';
import { useLibrary } from '../../lib/library';
import { useTheme } from '../../lib/theme';

export default function Home() {
  const t = useTheme();
  const { ready, folders, library, scanning, scanError, rescan } = useLibrary();
  const [query, setQuery] = useState('');

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? library.filter((m) => m.title.toLowerCase().includes(q)) : library;
  }, [library, query]);

  if (!ready) return null;

  if (folders.length === 0) {
    return (
      <EmptyState
        icon="folder-open-outline"
        title="No manhwa folders yet"
        message="Add a folder in Settings and your PDF manhwa will show up here."
        action="Open Settings"
        onAction={() => router.navigate('/settings')}
      />
    );
  }

  if (library.length === 0) {
    return scanning ? (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} size="large" />
        <Text style={{ color: t.sub, marginTop: 12 }}>Scanning folders…</Text>
      </View>
    ) : (
      <EmptyState
        icon="document-outline"
        title="No manhwa found"
        message={
          scanError ??
          'None of your folders contain PDFs. Each manhwa should be a folder holding one PDF per chapter.'
        }
        action="Scan again"
        onAction={rescan}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.search, { backgroundColor: t.card }]}>
        <Ionicons name="search" size={18} color={t.sub} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${library.length} manhwa`}
          placeholderTextColor={t.sub}
          style={[styles.input, { color: t.text }]}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query ? <Ionicons name="close-circle" size={18} color={t.sub} onPress={() => setQuery('')} /> : null}
      </View>
      {data.length === 0 ? (
        <EmptyState icon="search" title="No matches" />
      ) : (
        <ManhwaGrid data={data} onRefresh={rescan} refreshing={scanning} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  input: { flex: 1, height: 42, fontSize: 15 },
});
