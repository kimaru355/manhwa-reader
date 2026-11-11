import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { DownloadsProvider } from '../lib/downloads';
import { LibraryProvider } from '../lib/library';
import { RecsProvider } from '../lib/recs';

export default function RootLayout() {
  return (
    <LibraryProvider>
      <RecsProvider>
        <DownloadsProvider>
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="series" />
            <Stack.Screen name="reader" options={{ animation: 'fade' }} />
          </Stack>
        </DownloadsProvider>
      </RecsProvider>
    </LibraryProvider>
  );
}
