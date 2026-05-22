import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { API_BASE_URL } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SCENES_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';

function isDevLoginEnabled() {
  return /localhost|127\.0\.0\.1|dev/i.test(API_BASE_URL);
}

export default function LoginScreen() {
  const router = useRouter();
  const { isLoading, sendMagicLink, session, signInDev, signInGoogle } = useSession();
  const { pushError } = useErrorBanner();
  const [email, setEmail] = useState('');
  const [devEmail, setDevEmail] = useState('dev@example.com');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [isSigningInDev, setIsSigningInDev] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (session) {
    return <Redirect href={SCENES_ROUTE} />;
  }

  async function handleMagicLink() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      pushError('Enter your email address.');
      return;
    }

    setIsSendingLink(true);
    setNotice(null);
    try {
      await sendMagicLink(trimmedEmail);
      setNotice(`A sign-in link has been sent to ${trimmedEmail}. Please open it within 15 minutes.`);
    } catch {
      pushError('Could not send the sign-in link. Please try again later.');
    } finally {
      setIsSendingLink(false);
    }
  }

  async function handleDevSignIn() {
    const trimmedEmail = devEmail.trim();
    if (!trimmedEmail) {
      pushError('Enter a dev email address.');
      return;
    }

    setIsSigningInDev(true);
    try {
      await signInDev(trimmedEmail);
      router.replace(SCENES_ROUTE);
    } catch {
      pushError('Dev sign-in failed.');
    } finally {
      setIsSigningInDev(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-5 py-10">
      <View className="w-full max-w-md rounded-lg border border-app-line bg-app-card p-6 shadow-sm">
        <Text className="text-center text-3xl font-semibold text-app-text">XTBit</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-app-muted">Sign in to enter an urban fantasy relationship sandbox.</Text>

        <View className="mt-8 gap-3">
          <Text className="text-sm font-semibold text-app-text">Email sign-in</Text>
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
          <Button isLoading={isSendingLink} label="Send sign-in link" onPress={handleMagicLink} />
          {notice ? <Text className="text-sm leading-5 text-app-primary">{notice}</Text> : null}
        </View>

        <View className="mt-5">
          <Button label="Continue with Google" onPress={signInGoogle} variant="secondary" />
        </View>

        {isDevLoginEnabled() ? (
          <View className="mt-6 rounded-lg border border-app-line bg-app-bg p-4">
            <Text className="text-sm font-semibold text-app-text">Dev Sign-In</Text>
            <TextInput
              autoCapitalize="none"
              inputMode="email"
              onChangeText={setDevEmail}
              placeholder="dev@example.com"
              placeholderTextColor="#8B949E"
              value={devEmail}
              className="mt-3 min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text"
            />
            <View className="mt-3">
              <Button isLoading={isSigningInDev} label="Dev Sign-In" onPress={handleDevSignIn} variant="secondary" />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}
