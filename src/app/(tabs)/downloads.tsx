import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppUpdateCard } from '../../components/AppUpdateCard';
import { Cover } from '../../components/Cover';
import { EmptyState } from '../../components/EmptyState';
import { SelectBar, SelectButton } from '../../components/SelectBar';
import { SeriesGrid } from '../../components/SeriesGrid';
import { useSelection } from '../../lib/useSelection';
import { useAppUpdate } from '../../lib/appUpdate';
import { useDownloads, type Job } from '../../lib/downloads';
import { openSeries } from '../../lib/series';
import { getSource } from '../../lib/sources';
import { useTheme } from '../../lib/theme';
import type { Series } from '../../lib/types';

type Group = { series: Series; jobs: Job[] };

export default function Downloads() {
  const t = useTheme();
  const { items, queue, started, start, stop, cancelSeries, removeSeries, moveSeries } = useDownloads();
  const appUpdate = useAppUpdate();
  const sel = useSelection();

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const job of queue) {
      const g = map.get(job.series.key) ?? { series: job.series, jobs: [] };
      g.jobs.push(job);
      map.set(job.series.key, g);
    }
    return [...map.values()];
  }, [queue]);

  const empty = (
    <EmptyState
      icon="download-outline"
      title="Nothing downloaded"
      message="Add chapters to download from a title's page, then start them here."
    />
  );

  if (items.length === 0 && groups.length === 0 && !appUpdate) return empty;

  const anyRunning = groups.some((g) => started.includes(g.series.key));

  const confirmCancel = (g: Group) =>
    Alert.alert(`Remove "${g.series.title}" from the list?`, `${g.jobs.length} chapter${g.jobs.length === 1 ? '' : 's'} will not be downloaded.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => cancelSeries(g.series.key) },
    ]);

  const status = (g: Group) => {
    const active = g.jobs.find((j) => j.state === 'active');
    const failed = g.jobs.filter((j) => j.state === 'error').length;
    const on = started.includes(g.series.key);
    if (active) {
      // A novel chapter is one file, so progress is counted in chapters left.
      return getSource(g.series.source)?.kind === 'text'
        ? `Downloading · ${active.chapter.name} · ${g.jobs.length} left`
        : `Downloading · ${active.chapter.name} · ${active.done}/${active.total || '…'} pages`;
    }
    if (failed && on) return `${failed} failed — ${g.jobs.find((j) => j.error)?.error}`;
    if (on) return 'Waiting…';
    return failed ? `${failed} failed · tap Start to retry` : 'Ready to start';
  };

  // The app's own update stays first, so it's easy to find and install.
  const header = (
    <View style={styles.queue}>
      <AppUpdateCard />
      {groups.length ? (
        <View style={styles.queueHead}>
          <Text style={[styles.queueTitle, { color: t.text }]}>To download</Text>
          <Pressable
            onPress={() => (anyRunning ? stop() : start())}
            style={[styles.bigBtn, { backgroundColor: anyRunning ? t.card : t.accent }]}
          >
            <Ionicons name={anyRunning ? 'pause' : 'play'} size={16} color={anyRunning ? t.text : '#fff'} />
            <Text style={{ color: anyRunning ? t.text : '#fff', fontWeight: '600' }}>{anyRunning ? 'Pause all' : 'Start all'}</Text>
          </Pressable>
        </View>
      ) : null}

      {groups.map((g, gi) => {
        const on = started.includes(g.series.key);
        return (
          <View key={g.series.key} style={[styles.group, { backgroundColor: t.card }]}>
            <Pressable style={styles.groupTop} onPress={() => openSeries(g.series)}>
              <Cover series={g.series} style={styles.thumb} />
              <View style={styles.groupText}>
                <Text numberOfLines={1} style={[styles.groupTitle, { color: t.text }]}>
                  {g.series.title}
                </Text>
                <Text style={{ color: t.sub, fontSize: 13 }}>
                  {g.jobs.length} chapter{g.jobs.length === 1 ? '' : 's'} to download
                </Text>
                <Text numberOfLines={2} style={{ color: g.jobs.some((j) => j.state === 'error') && on ? t.danger : t.sub, fontSize: 12 }}>
                  {status(g)}
                </Text>
              </View>
            </Pressable>
            <Text numberOfLines={2} style={{ color: t.sub, fontSize: 12 }}>
              {g.jobs
                .slice(0, 4)
                .map((j) => j.chapter.name)
                .join(' · ')}
              {g.jobs.length > 4 ? ` · +${g.jobs.length - 4} more` : ''}
            </Text>
            <View style={styles.groupActions}>
              <Pressable
                onPress={() => (on ? stop(g.series.key) : start(g.series.key))}
                style={[styles.smallBtn, { backgroundColor: on ? t.bg : t.accent }]}
              >
                <Ionicons name={on ? 'pause' : 'play'} size={14} color={on ? t.text : '#fff'} />
                <Text style={{ color: on ? t.text : '#fff', fontWeight: '600', fontSize: 13 }}>{on ? 'Pause' : 'Start'}</Text>
              </Pressable>
              <View style={styles.order}>
                <Pressable
                  hitSlop={8}
                  disabled={gi === 0}
                  onPress={() => moveSeries(g.series.key, 'top')}
                  style={{ opacity: gi === 0 ? 0.3 : 1 }}
                  accessibilityLabel="Push to top"
                >
                  <Ionicons name="arrow-up-circle" size={26} color={gi === 0 ? t.sub : t.accent} />
                </Pressable>
                <Pressable hitSlop={8} disabled={gi === 0} onPress={() => moveSeries(g.series.key, -1)} style={{ opacity: gi === 0 ? 0.3 : 1 }} accessibilityLabel="Push up">
                  <Ionicons name="arrow-up-circle-outline" size={26} color={t.sub} />
                </Pressable>
                <Pressable
                  hitSlop={8}
                  disabled={gi === groups.length - 1}
                  onPress={() => moveSeries(g.series.key, 1)}
                  style={{ opacity: gi === groups.length - 1 ? 0.3 : 1 }}
                >
                  <Ionicons name="arrow-down-circle-outline" size={26} color={t.sub} />
                </Pressable>
              </View>
              <Pressable hitSlop={8} onPress={() => confirmCancel(g)}>
                <Ionicons name="close-circle-outline" size={24} color={t.sub} />
              </Pressable>
            </View>
          </View>
        );
      })}

      {items.length ? (
        <View style={[styles.queueHead, { marginTop: groups.length || appUpdate ? 16 : 0 }]}>
          {groups.length || appUpdate ? <Text style={[styles.queueTitle, { color: t.text }]}>Downloaded</Text> : <View />}
          {!sel.on ? <SelectButton onPress={() => sel.start()} /> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {sel.on ? (
        <SelectBar
          sel={sel}
          keys={items.map((i) => i.series.key)}
          noun="downloads"
          detail="Removes their downloaded chapters from this phone."
          onDelete={(keys) => keys.forEach(removeSeries)}
        />
      ) : null}
      <SeriesGrid
        data={items.map((i) => i.series)}
        header={header}
        empty={groups.length ? undefined : empty}
        selection={sel}
        sub={(s) => {
          const n = items.find((i) => i.series.key === s.key)?.chapters.length ?? 0;
          return `${n} chapter${n === 1 ? '' : 's'} saved`;
        }}
        onLongPress={(key) => sel.start(key)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  queue: { gap: 10, marginBottom: 6 },
  queueHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  queueTitle: { fontSize: 17, fontWeight: '700' },
  bigBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  group: { padding: 12, borderRadius: 12, gap: 8 },
  groupTop: { flexDirection: 'row', gap: 12 },
  thumb: { width: 48, height: 66 },
  groupText: { flex: 1, gap: 2 },
  groupTitle: { fontSize: 15, fontWeight: '600' },
  order: { flexDirection: 'row', gap: 10, marginLeft: 'auto', marginRight: 10 },
  groupActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
});
