import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';

import { AccountProvider } from '../lib/account';
import { DownloadsProvider } from '../lib/downloads';
import { LibraryProvider } from '../lib/library';
import { RecsProvider } from '../lib/recs';

/** Replaces the default red error screen so a crash never shows technical text. */
export function ErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, backgroundColor: '#121214' }}>
      <Text style={{ color: '#F2F2F4', fontSize: 18, fontWeight: '700' }}>Something went wrong</Text>
      <Text style={{ color: '#8E8E98', textAlign: 'center' }}>This screen couldn&apos;t load. Try again.</Text>
      <Pressable onPress={retry} style={{ backgroundColor: '#B76CF0', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  return (
    <LibraryProvider>
      <AccountProvider>
      <RecsProvider>
        <DownloadsProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="series" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="account" />
            <Stack.Screen name="reader" options={{ animation: 'fade' }} />
          </Stack>
        </DownloadsProvider>
      </RecsProvider>
      </AccountProvider>
    </LibraryProvider>
  );
}
