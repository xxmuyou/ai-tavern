import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { consumePendingAuthRedirect } from '@/components/web/WebAuthControls';
import { AUTH_LOGIN_ROUTE, DISCOVER_ROUTE, SCENES_ROUTE } from '@/constants/routes';
import { useSession } from '@/hooks/use-session';
import { trackWebEvent } from '@/utils/analytics';

const errorMessages: Record<string, string> = {
  email_unverified: 'Your Google account email is not verified. Please verify it and try again.',
  invalid_magic_link: 'This sign-in link has expired. Please request a new one.',
  invalid_oauth_state: 'Your sign-in session has expired. Please try again.',
  invalid_oauth_token: 'Third-party sign-in verification failed. Please try again.',
  provider_not_configured: 'This sign-in method is not available yet.',
};

export default function AuthSuccessScreen() {
  const router = useRouter();
  const { acceptSessionFragment } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const hash = window.location.hash;
    const query = new URLSearchParams(window.location.search);
    const code = query.get('error');

    if (hash.includes('token=')) {
      const session = acceptSessionFragment(hash);
      if (session) {
        trackWebEvent('auth_completed', {
          result: 'success',
        });
        const fallback = Platform.OS === 'web' ? DISCOVER_ROUTE : SCENES_ROUTE;
        router.replace((consumePendingAuthRedirect() ?? fallback) as Href);
        return;
      }
      trackWebEvent('auth_completed', {
        result: 'failed',
      });
      setError('The sign-in information is invalid. Please sign in again.');
      return;
    }

    if (code) {
      trackWebEvent('auth_completed', {
        result: 'failed',
      });
      setError(errorMessages[code] ?? 'Sign-in failed. Please try again later.');
      return;
    }

    router.replace(AUTH_LOGIN_ROUTE);
  }, [acceptSessionFragment, router]);

  if (!error) {
    return <LoadingScreen label="Completing sign-in..." />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-6">
      <View className="w-full max-w-md rounded-lg border border-app-line bg-app-card p-6">
        <Text className="text-center text-2xl font-semibold text-app-text">Sign-in failed</Text>
        <Text className="mt-3 text-center text-sm leading-5 text-app-muted">{error}</Text>
        <View className="mt-6">
          <Button label="Sign in again" onPress={() => router.replace(AUTH_LOGIN_ROUTE)} />
        </View>
      </View>
    </View>
  );
}
