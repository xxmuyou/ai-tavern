import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { isApiRequestError } from '@/api/companion-client';
import { ADMIN_ROUTE, BILLING_ROUTE, ME_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useMe } from '@/hooks/use-me';
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
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const { me } = useMe();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
      <View className="relative z-50">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account menu"
          accessibilityState={{ expanded: menuOpen }}
          onPress={() => setMenuOpen((open) => !open)}
          className="h-9 w-9 items-center justify-center rounded-full border border-app-line bg-rose-soft shadow-card hover:border-app-rose/40"
        >
          <Text className="font-serif text-body-sm font-semibold text-rose-deep">
            {session.email.slice(0, 1).toUpperCase()}
          </Text>
        </Pressable>
        {menuOpen ? (
          <View className="absolute right-0 top-11 w-56 gap-1 rounded-2xl border border-app-line bg-app-surface p-2 shadow-float">
            <View className="border-b border-app-line px-3 py-2">
              <Text numberOfLines={1} className="text-caption font-semibold text-app-ink">
                {session.email}
              </Text>
            </View>
            <AccountMenuItem
              icon="person-circle-outline"
              label="Me"
              onPress={() => {
                setMenuOpen(false);
                router.push(ME_ROUTE);
              }}
            />
            <AccountMenuItem
              icon="card-outline"
              label="Billing"
              onPress={() => {
                setMenuOpen(false);
                router.push(BILLING_ROUTE);
              }}
            />
            {me?.is_admin ? (
              <AccountMenuItem
                icon="shield-checkmark-outline"
                label="Admin"
                onPress={() => {
                  setMenuOpen(false);
                  router.push(ADMIN_ROUTE);
                }}
              />
            ) : null}
            <AccountMenuItem
              icon="log-out-outline"
              label="Sign out"
              onPress={() => {
                setMenuOpen(false);
                void signOut();
              }}
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <WebButton
        iconLeft={<Ionicons color="#9A2F4F" name="person-circle-outline" size={17} />}
        label="Sign in"
        onPress={() => setDialogOpen(true)}
        variant="secondary"
      />
      <WebDialog
        description="Continue with Google or get a one-time email link."
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        title="Sign in to your sandbox"
      >
        <View className="gap-4">
          <WebButton
            iconLeft={<Ionicons color="#3B6EA5" name="logo-google" size={18} />}
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
          {notice ? <Text className="text-caption text-rose-deep">{notice}</Text> : null}
          <Text className="text-caption leading-5 text-app-muted">
            Open the link on this device. Local dev sessions may return a token immediately.
          </Text>
        </View>
      </WebDialog>
    </>
  );
}

function AccountMenuItem({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-10 flex-row items-center gap-2 rounded-xl px-3 hover:bg-app-sunken"
    >
      <Ionicons color="#7A6A5E" name={icon} size={16} />
      <Text className="text-caption font-semibold text-app-ink-soft">{label}</Text>
    </Pressable>
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
