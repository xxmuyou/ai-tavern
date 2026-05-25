import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { isDevClientEnvironment } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SCENES_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';

function isDevLoginEnabled() {
  return isDevClientEnvironment();
}

export default function LoginScreen() {
  const router = useRouter();
  const { isLoading, sendMagicLink, session, signInDev } = useSession();
  const { pushError } = useErrorBanner();
  const isDevLogin = isDevLoginEnabled();
  const [email, setEmail] = useState(isDevLogin ? 'admin@aiappsbox.com' : '');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (session) {
    return <Redirect href={SCENES_ROUTE} />;
  }

  async function handleSignIn() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      pushError('Enter your email address.');
      return;
    }

    setIsSigningIn(true);
    setNotice(null);
    try {
      if (isDevLogin) {
        await signInDev(trimmedEmail);
        router.replace(SCENES_ROUTE);
        return;
      }

      const response = await sendMagicLink(trimmedEmail);
      setNotice(response.verify_url
        ? `Sign-in link is ready for ${trimmedEmail}. Open it within 15 minutes.`
        : `A sign-in link has been sent to ${trimmedEmail}. Please open it within 15 minutes.`);
    } catch (err) {
      if ((err as Error & { status?: number }).status === 403) {
        pushError('This email is not allowed to sign in.');
      } else {
        pushError(isDevLogin ? 'Sign-in failed.' : 'Could not send the sign-in link. Please try again later.');
      }
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-5 py-10">
      <View className="w-full max-w-md rounded-lg border border-app-line bg-app-card p-6 shadow-sm">
        <Text className="text-center text-3xl font-semibold text-app-text">XTBit</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-app-muted">Sign in to enter an urban fantasy relationship sandbox.</Text>

        <View className="mt-8 gap-3">
          <Text className="text-sm font-semibold text-app-text">Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#8B949E"
            value={email}
            className="min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text"
          />
          <Button
            isLoading={isSigningIn}
            label={isDevLogin ? 'Sign in' : 'Send sign-in link'}
            onPress={handleSignIn}
          />
          {notice ? <Text className="text-sm leading-5 text-app-primary">{notice}</Text> : null}
        </View>
      </View>
    </View>
  );
}
