import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { LibraryProvider } from '../lib/library';

export default function RootLayout() {
  return (
    <LibraryProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="manhwa" />
        <Stack.Screen name="reader" options={{ animation: 'fade' }} />
      </Stack>
    </LibraryProvider>
  );
}
