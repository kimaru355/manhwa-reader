import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../lib/theme';

export function EmptyState({
  icon,
  title,
  message,
  action,
  onAction,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={56} color={t.sub} />
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {message ? <Text style={[styles.msg, { color: t.sub }]}>{message}</Text> : null}
      {action ? (
        <Pressable onPress={onAction} style={[styles.btn, { backgroundColor: t.accent }]}>
          <Text style={styles.btnText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  msg: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 10, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
