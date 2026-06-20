import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isApiRequestError } from '@/api/companion-client';
import { LoadingScreen } from '@/components/LoadingScreen';
import { CharaPalLogo } from '@/components/web/CharaPalLogo';
import { WebLegalLinks } from '@/components/web/WebLegalLinks';
import { WebButton, WebInput } from '@/components/web/ui';
import { DISCOVER_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';
import { trackWebEvent, trackWebPageView } from '@/utils/analytics';

function signInErrorMessage(error: unknown): string {
  if (isApiRequestError(error) && error.code === 'api_unreachable') {
    return `The local API is not reachable at ${error.apiBaseUrl}. Start it with pnpm run:local.`;
  }
  return 'Could not sign in. Please try again.';
}

export default function WebLoginScreen() {
  const params = useLocalSearchParams<{ redirect?: string }>();
  const router = useRouter();
  const { isLoading, sendMagicLink, session, signInGoogle } = useSession();
  const { pushError } = useErrorBanner();
  const [email, setEmail] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const target = ((params.redirect && params.redirect.startsWith('/')) ? params.redirect : DISCOVER_ROUTE) as Href;

  useEffect(() => {
    trackWebPageView('Login', '/auth/login');
  }, []);

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (session) {
    return <Redirect href={target} />;
  }

  async function handleSendLink() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      pushError('Enter your email address.');
      return;
    }

    setIsSendingLink(true);
    setNotice(null);
    trackWebEvent('auth_started', {
      method: 'email',
      redirect_target: String(target),
    });
    try {
      const response = await sendMagicLink(trimmedEmail);
      if (response.token) {
        trackWebEvent('auth_completed', {
          method: 'email',
          result: 'success',
        });
        router.replace(target);
        return;
      }
      setNotice(response.verify_url
        ? `Sign-in link is ready for ${trimmedEmail}. Open it in this browser to continue.`
        : `A sign-in link has been sent to ${trimmedEmail}.`);
    } catch (error) {
      pushError(signInErrorMessage(error));
    } finally {
      setIsSendingLink(false);
    }
  }

  return (
    <View className="min-h-screen flex-1 items-center justify-center bg-[#10070d] px-6 py-10">
      <View pointerEvents="none" className="absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(ellipse_at_top,rgba(201,72,107,0.32)_0%,rgba(93,24,54,0.20)_38%,transparent_72%)]" />
      <View className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] shadow-[0_24px_80px_rgba(0,0,0,0.38)]">
        <View className="border-b border-white/10 px-7 py-6">
          <Pressable accessibilityRole="link" onPress={() => router.push(DISCOVER_ROUTE)} className="mb-7">
            <CharaPalLogo markSize={32} />
          </Pressable>
          <Text className="font-serif text-display-sm text-white">Sign in</Text>
          <Text className="mt-2 text-body-sm leading-6 text-rose-50/64">
            Local development signs you in immediately after you enter an email.
          </Text>
        </View>

        <View className="gap-4 px-7 py-6">
          <WebButton
            iconLeft={<Ionicons color="#bae6fd" name="logo-google" size={18} />}
            label="Continue with Google"
            onPress={() => {
              trackWebEvent('auth_started', {
                method: 'google',
                redirect_target: String(target),
              });
              signInGoogle();
            }}
            size="lg"
            variant="google"
          />
          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-white/10" />
            <Text className="text-overline text-rose-50/60">or email</Text>
            <View className="h-px flex-1 bg-white/10" />
          </View>
          <WebInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            label="Email address"
            onChangeText={setEmail}
            onSubmitEditing={() => void handleSendLink()}
            placeholder="you@example.com"
            value={email}
          />
          <WebButton
            isLoading={isSendingLink}
            label="Sign in"
            onPress={handleSendLink}
            size="lg"
          />
          {notice ? <Text className="text-caption leading-5 text-rose-200">{notice}</Text> : null}
        </View>
      </View>
      <WebLegalLinks className="mt-6" />
    </View>
  );
}
