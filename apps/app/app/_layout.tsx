import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ErrorBanner } from '@/components/ErrorBanner';
import { ErrorBannerProvider } from '@/hooks/use-error-banner';
import { SessionProvider } from '@/hooks/use-session';

import '../global.css';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <ThemeProvider value={DefaultTheme}>
      <SessionProvider>
        <ErrorBannerProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth/login" />
            <Stack.Screen name="auth/success" />
            <Stack.Screen name="chat/[companionId]" />
          </Stack>
          <ErrorBanner />
          <StatusBar style="dark" />
        </ErrorBannerProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
