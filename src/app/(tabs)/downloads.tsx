import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '../../components/EmptyState';
import { SeriesGrid } from '../../components/SeriesGrid';
import { useDownloads } from '../../lib/downloads';
import { useTheme } from '../../lib/theme';

export default function Downloads() {
  const t = useTheme();
  const { items, jobs, cancel, removeSeries } = useDownloads();
  const active = Object.values(jobs);

  if (items.length === 0 && active.length === 0) {
    return (
      <EmptyState
        icon="download-outline"
        title="Nothing downloaded"
        message="Download chapters from a title's page to read them offline."
      />
    );
  }

  const progress = active.length ? (
    <View style={[styles.queue, { backgroundColor: t.card }]}>
      <Text style={[styles.queueTitle, { color: t.text }]}>Downloading ({active.length})</Text>
      {active.slice(0, 5).map((j) => (
        <View key={`${j.series.key}|${j.chapter.id}`} style={styles.job}>
          <View style={styles.jobText}>
            <Text numberOfLines={1} style={{ color: t.text, fontSize: 13 }}>
              {j.series.title} · {j.chapter.name}
            </Text>
            <Text style={{ color: j.state === 'error' ? t.danger : t.sub, fontSize: 12 }}>
              {j.state === 'queued' ? 'Waiting' : j.state === 'error' ? j.error : `${j.done}/${j.total || '…'} pages`}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={() => cancel(j.series.key, j.chapter.id)}>
            <Ionicons name="close-circle-outline" size={22} color={t.sub} />
          </Pressable>
        </View>
      ))}
      {active.length > 5 ? <Text style={{ color: t.sub, fontSize: 12 }}>…and {active.length - 5} more</Text> : null}
    </View>
  ) : undefined;

  const confirmRemove = (key: string) => {
    const item = items.find((i) => i.series.key === key);
    if (!item) return;
    Alert.alert(`Delete "${item.series.title}"?`, 'Removes its downloaded chapters from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeSeries(key) },
    ]);
  };

  return (
    <SeriesGrid
      data={items.map((i) => i.series)}
      header={progress}
      sub={(s) => {
        const n = items.find((i) => i.series.key === s.key)?.chapters.length ?? 0;
        return `${n} chapter${n === 1 ? '' : 's'} saved`;
      }}
      onLongPress={confirmRemove}
    />
  );
}

const styles = StyleSheet.create({
  queue: { padding: 12, borderRadius: 12, gap: 10, marginBottom: 12 },
  queueTitle: { fontWeight: '700', fontSize: 15 },
  job: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  jobText: { flex: 1 },
});
