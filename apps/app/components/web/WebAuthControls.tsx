import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BRAND_NAME } from '@/constants/brand';
import { PALETTE } from '@/constants/palette';

import { isApiRequestError } from '@/api/companion-client';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';

import { WebButton, WebDialog, WebInput } from './ui';

const AUTH_REDIRECT_STORAGE_KEY = 'xtbit.auth.redirect';

function signInErrorMessage(error: unknown): string {
  if (isApiRequestError(error) && error.code === 'api_unreachable') {
    return `The API is not reachable at ${error.apiBaseUrl}.`;
  }
  return 'Could not send the sign-in link. Please try again later.';
}

export function WebAuthControls() {
  const { sendMagicLink, session, signInGoogle, signOut } = useSession();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const { pushError } = useErrorBanner();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSendLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      pushError('Enter your email address.');
      return;
    }
    setIsSendingLink(true);
    setNotice(null);
    try {
      storePendingRedirect(params.redirect);
      const response = await sendMagicLink(trimmed);
      if (response.token) {
        clearPendingRedirect();
        setDialogOpen(false);
        return;
      }
      setNotice(response.verify_url ? `Sign-in link is ready for ${trimmed}.` : `A sign-in link has been sent to ${trimmed}.`);
    } catch (error) {
      pushError(signInErrorMessage(error));
    } finally {
      setIsSendingLink(false);
    }
  }

  if (session) {
    return (
      <View className="flex-row items-center gap-2 rounded-full border border-app-line bg-app-surface px-2.5 py-2 shadow-card">
        <View className="h-8 w-8 items-center justify-center rounded-full bg-app-rose-soft">
          <Text className="font-serif text-body-sm font-semibold text-app-rose-deep">
            {session.email.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View className="hidden min-w-0 max-w-[220px] md:flex">
          <Text numberOfLines={1} className="text-caption font-semibold text-app-ink">
            {session.email}
          </Text>
          <Text className="text-[11px] font-semibold uppercase tracking-wider text-app-muted">Signed in</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={() => void signOut()}
          className="h-8 w-8 items-center justify-center rounded-full hover:bg-app-sunken"
        >
          <Ionicons color={PALETTE.muted} name="log-out-outline" size={17} />
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <WebButton
        iconLeft={<Ionicons color="#FFFFFF" name="person-circle-outline" size={17} />}
        label="Sign in"
        onPress={() => setDialogOpen(true)}
        variant="primary"
      />
      <WebDialog
        description="Continue with Google or get a one-time email link."
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        title={`Sign in to ${BRAND_NAME}`}
      >
        <View className="gap-4">
          <WebButton
            iconLeft={<Ionicons color="#4285F4" name="logo-google" size={18} />}
            label="Continue with Google"
            onPress={() => {
              storePendingRedirect(params.redirect);
              signInGoogle();
            }}
            size="lg"
            variant="google"
          />
          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-app-line" />
            <Text className="text-overline text-app-muted">or email</Text>
            <View className="h-px flex-1 bg-app-line" />
          </View>
          <WebInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            label="Email address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          />
          <WebButton
            isLoading={isSendingLink}
            label="Send sign-in link"
            onPress={handleSendLink}
            size="lg"
            variant="outline"
          />
          {notice ? <Text className="text-caption text-app-rose-deep">{notice}</Text> : null}
          <Text className="text-caption leading-5 text-app-muted">
            Open the link on this device. Local dev sessions may return a token immediately.
          </Text>
        </View>
      </WebDialog>
    </>
  );
}

function storePendingRedirect(value: string | undefined) {
  if (typeof window === 'undefined' || !value?.startsWith('/')) {
    return;
  }
  window.localStorage.setItem(AUTH_REDIRECT_STORAGE_KEY, value);
}

function clearPendingRedirect() {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(AUTH_REDIRECT_STORAGE_KEY);
}

export function consumePendingAuthRedirect(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = window.localStorage.getItem(AUTH_REDIRECT_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_REDIRECT_STORAGE_KEY);
  return value?.startsWith('/') ? value : null;
}
