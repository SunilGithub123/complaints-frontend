/**
 * Mobile app root layout (expo-router). Equivalent to `apps/web/src/App.tsx`.
 *
 * - Wires `@complaints/api` to the auth stores (stubbed in 21.3-a; real
 *   stores land in 21.3-b alongside the auth screens).
 * - Initialises the shared i18n singleton.
 * - Provides QueryClient + SafeArea to every route.
 *
 * Keep this file thin — feature wiring belongs in feature folders, not
 * in the root layout.
 */
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { initI18n } from '@complaints/i18n';

import { wireApi } from '@/lib/wireApi';
import { wireI18n } from '@/lib/wireI18n';
import { wirePushProvider } from '@/lib/wirePushProvider';
import { wirePushHandlers } from '@/lib/pushMessageHandler';
import { detectRevokedPushPermission } from '@/lib/detectRevokedPushPermission';

// Single boot wiring — synchronous so `setAuthHooks` is in place by the
// time the first generated TanStack Query hook fires. `wireI18n()` plugs
// AsyncStorage into the i18n adapter and kicks off the async load of the
// persisted locale (Stage 21.3-b.3-a). `wirePushProvider()` swaps the
// default stub `PushProvider` for the real FCM one when the app is
// built with `EXPO_PUBLIC_ENABLE_PUSH=true` and real Firebase
// credentials are in place (see credentials/README.md).
// `wirePushHandlers()` (Stage 21.3-c.3) registers the FCM
// background/foreground/tap handlers — no-op when push is disabled.
// `detectRevokedPushPermission()` (Stage 21.3-c.2-b) reconciles §9.6
// OS-level revokes on cold start — fire-and-forget, no-ops when push
// is disabled or the stub provider is active.
wireApi();
initI18n();
wireI18n();
wirePushProvider();
wirePushHandlers();
void detectRevokedPushPermission();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

export default function RootLayout(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

