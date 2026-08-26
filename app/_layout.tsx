import { JetBrainsMono_500Medium, useFonts } from '@expo-google-fonts/jetbrains-mono';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { HoverHints } from '@/components/hover-hints';
import { SyncBridge } from '@/components/sync-bridge';
import { TourProvider } from '@/components/tour/tour-context';
import { TourOverlay } from '@/components/tour/tour-overlay';
import { UndoToastProvider } from '@/components/undo-toast';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initNotifications } from '@/lib/notifications';
import { initTelemetry } from '@/lib/telemetry/system';
import { AppThemeProvider, useTheme } from '@/lib/theme/use-theme';

// One QueryClient for the app's lifetime (module scope, NOT inside the
// component — recreating it on re-render would wipe the cache).
const queryClient = new QueryClient();

// Foreground notification display + Android channel — once per process.
initNotifications();
// Crash/error telemetry — dormant until EXPO_PUBLIC_SENTRY_DSN is set
// (rubric #8). Fire-and-forget: the app never waits on it.
void initTelemetry();

export const unstable_settings = {
  anchor: '(tabs)',
};

// Stack.Protected mounts its screens only while `guard` is true, and
// automatically navigates away if the guard flips (e.g. session expires
// mid-use → back to sign-in; sign-in succeeds → into the app). This is
// expo-router v6's built-in auth pattern — no manual redirects needed.
function RootNavigator() {
  const { session, isLoading } = useAuth();

  // While the persisted session loads from disk (a few ms), render nothing —
  // the splash screen is still up, so the user never sees a flash of the
  // wrong screen.
  if (isLoading) {
    return null;
  }

  return (
    <Stack>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Quick-add and task-edit are transparent routes, NOT RN <Modal>s —
            Reanimated updates don't apply inside Modal's separate native
            window. Each route animates its own sheet; the list stays
            visible behind. */}
        <Stack.Screen
          name="quick-add"
          options={{ presentation: 'transparentModal', animation: 'none', headerShown: false }}
        />
        <Stack.Screen
          name="task/[id]"
          options={{ presentation: 'transparentModal', animation: 'none', headerShown: false }}
        />
        {/* Calendar day drill-down: transparent route with a custom ZOOM
            transition (the native stack has no zoom animation). */}
        <Stack.Screen
          name="day/[date]"
          options={{ presentation: 'transparentModal', animation: 'none', headerShown: false }}
        />
        <Stack.Screen
          name="import-events"
          options={{ presentation: 'transparentModal', animation: 'none', headerShown: false }}
        />
        <Stack.Screen
          name="styles"
          options={{ presentation: 'transparentModal', animation: 'none', headerShown: false }}
        />
        <Stack.Screen
          name="import-help"
          options={{ presentation: 'transparentModal', animation: 'none', headerShown: false }}
        />
        <Stack.Screen
          name="event/[id]"
          options={{ presentation: 'transparentModal', animation: 'none', headerShown: false }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* PUBLIC (outside both guards): policy pages must be readable
          without an account — App Store reviewers and prospective users
          land here from the store listing. */}
      <Stack.Screen name="confirmed" options={{ headerShown: false }} />
      <Stack.Screen name="support" options={{ headerShown: false }} />
      <Stack.Screen name="privacy" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
    </Stack>
  );
}

// Everything that depends on the RESOLVED scheme (user toggle > system)
// lives inside AppThemeProvider — navigation colors, browser chrome, and
// the status bar all flip together when the header toggle is tapped.
function ThemedApp() {
  const colorScheme = useColorScheme();
  const { colors, isDark } = useTheme();

  // Web: tell the browser which scheme we're rendering so NATIVE chrome
  // (scrollbars, form controls) matches — otherwise dark mode gets a glaring
  // white scrollbar.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = colorScheme === 'dark' ? 'dark' : 'light';
    }
  }, [colorScheme]);

  // Navigation chrome (tab bar, headers, backgrounds) draws from OUR tokens,
  // not the stock React Navigation palettes — the nav surfaces are part of
  // the skin seam (style packs must be able to restyle them too).
  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.surface,
        card: colors.surfaceElevated,
        text: colors.textPrimary,
        border: colors.borderSubtle,
        notification: colors.accent,
      },
    };
  }, [isDark, colors]);

  return (
    <ThemeProvider value={navTheme}>
      <UndoToastProvider>
        {/* Tour lives at the ROOT so its overlay paints above every route —
            the interactive tour walks into the quick-add sheet (v3). */}
        <TourProvider>
          <RootNavigator />
          <TourOverlay />
        </TourProvider>
        {/* Desktop hover hints — web-only (native file is a no-op). */}
        <HoverHints />
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </UndoToastProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // JetBrains Mono is the identity font for time chips (docs/design/03).
  // Hold the splash screen until it's ready so text never swaps mid-view.
  const [fontsLoaded] = useFonts({ JetBrainsMono_500Medium });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          {/* No-op in Expo Go; boots PowerSync in the dev build. */}
          <SyncBridge />
          <AppThemeProvider>
            <ThemedApp />
          </AppThemeProvider>
        </QueryClientProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
