import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { downloadAppUpdate, installAppUpdate, removeAppUpdate, useAppUpdate } from '../lib/appUpdate';
import { useTheme } from '../lib/theme';

/** The app's own update: its download progress, then an Install button. Renders nothing when there is none. */
export function AppUpdateCard() {
  const t = useTheme();
  const u = useAppUpdate();
  if (!u) return null;
  const name = u.info.versionName || String(u.info.versionCode);

  const confirmRemove = () =>
    Alert.alert(
      u.status === 'downloading' ? 'Stop downloading the update?' : 'Delete the downloaded update?',
      'It downloads again the next time the app opens.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: u.status === 'downloading' ? 'Stop' : 'Delete', style: 'destructive', onPress: () => removeAppUpdate() },
      ],
    );

  return (
    <View style={[styles.card, { backgroundColor: t.card }]}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: t.bg }]}>
          <Ionicons name="phone-portrait-outline" size={24} color={t.accent} />
        </View>
        <View style={styles.text}>
          <Text numberOfLines={1} style={[styles.title, { color: t.text }]}>
            Manhwa Reader {name}
          </Text>
          <Text numberOfLines={2} style={{ color: u.status === 'error' ? t.danger : t.sub, fontSize: 12 }}>
            {u.status === 'downloading'
              ? `App update · downloading ${Math.round(u.progress * 100)}%`
              : u.status === 'ready'
                ? 'App update · ready to install'
                : `Download failed — ${u.message}`}
          </Text>
        </View>
        <Pressable hitSlop={8} onPress={confirmRemove}>
          <Ionicons name="close-circle-outline" size={24} color={t.sub} />
        </Pressable>
      </View>

      {u.status === 'downloading' ? (
        <View style={[styles.track, { backgroundColor: t.bg }]}>
          <View style={[styles.fill, { backgroundColor: t.accent, width: `${Math.max(2, u.progress * 100)}%` }]} />
        </View>
      ) : (
        <Pressable
          onPress={() => (u.status === 'ready' ? installAppUpdate() : downloadAppUpdate(u.info))}
          style={[styles.btn, { backgroundColor: t.accent }]}
        >
          <Ionicons name={u.status === 'ready' ? 'download' : 'refresh'} size={16} color="#fff" />
          <Text style={styles.btnText}>{u.status === 'ready' ? 'Install' : 'Try again'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, borderRadius: 12, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 18 },
  btnText: { color: '#fff', fontWeight: '600' },
});
