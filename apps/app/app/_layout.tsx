import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ErrorBanner } from '@/components/ErrorBanner';
import { PushRegistrar } from '@/components/PushRegistrar';
import { PALETTE } from '@/constants/palette';
import { ErrorBannerProvider } from '@/hooks/use-error-banner';
import { SessionProvider } from '@/hooks/use-session';

import '../global.css';

export const unstable_settings = {
  anchor: '(tabs)',
};

const NocturneTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: PALETTE.canvas,
    card: PALETTE.surface,
    border: PALETTE.line,
    primary: PALETTE.rose,
    text: PALETTE.ink,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={NocturneTheme}>
      <SessionProvider>
        <ErrorBannerProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/success" />
            <Stack.Screen name="admin/index" />
            <Stack.Screen name="billing/index" />
            <Stack.Screen name="chat/[companionId]" />
            <Stack.Screen name="companion-create" />
            <Stack.Screen name="companion-import" />
            <Stack.Screen name="companion/[id]" />
            <Stack.Screen name="companion/[id]/edit" />
            <Stack.Screen name="companion/[id]/story-setup" />
            <Stack.Screen name="memories" />
            <Stack.Screen name="personas" />
            <Stack.Screen name="scene/[id]" />
          </Stack>
          <PushRegistrar />
          <ErrorBanner />
          <StatusBar style="light" />
        </ErrorBannerProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
