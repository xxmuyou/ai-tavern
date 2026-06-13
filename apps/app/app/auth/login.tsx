import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { isApiRequestError } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SCENES_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';

function signInErrorMessage(error: unknown): string {
  if (isApiRequestError(error) && error.code === 'api_unreachable') {
    return `The API is not reachable at ${error.apiBaseUrl}.`;
  }
  return 'Could not send the sign-in link. Please try again later.';
}

export default function LoginScreen() {
  const router = useRouter();
  const { isLoading, sendMagicLink, session, signInGoogle } = useSession();
  const { pushError } = useErrorBanner();
  const [email, setEmail] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (session) {
    return <Redirect href={SCENES_ROUTE} />;
  }

  async function handleSendLink() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      pushError('Enter your email address.');
      return;
    }

    setIsSendingLink(true);
    setNotice(null);
    try {
      const response = await sendMagicLink(trimmedEmail);
      if (response.token) {
        router.replace(SCENES_ROUTE);
        return;
      }
      setNotice(response.verify_url
        ? `Sign-in link is ready for ${trimmedEmail}. Open it within 15 minutes.`
        : `A sign-in link has been sent to ${trimmedEmail}. Please open it within 15 minutes.`);
    } catch (error) {
      pushError(signInErrorMessage(error));
    } finally {
      setIsSendingLink(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-5 py-10">
      <View className="w-full max-w-md rounded-lg border border-app-line bg-app-card p-6 shadow-sm">
        <Text className="text-center text-3xl font-semibold text-app-text">XTBit</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-app-muted">Sign in to enter an urban fantasy relationship sandbox.</Text>

        <View className="mt-8 gap-3">
          <Button
            iconLeft={<Ionicons color="#3B6EA5" name="logo-google" size={18} />}
            label="Continue with Google"
            onPress={signInGoogle}
            variant="google"
          />
          <View className="my-2 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-app-line" />
            <Text className="text-xs uppercase tracking-normal text-app-muted">or email</Text>
            <View className="h-px flex-1 bg-app-line" />
          </View>
          <Text className="text-sm font-semibold text-app-text">Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#8B949E"
            value={email}
            className="min-h-12 rounded-lg border border-app-line bg-app-sunken px-4 text-base text-app-text"
          />
          <Button isLoading={isSendingLink} label="Send sign-in link" onPress={handleSendLink} variant="secondary" />
          {notice ? <Text className="text-sm leading-5 text-app-primary">{notice}</Text> : null}
        </View>
      </View>
    </View>
  );
}
