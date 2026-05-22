import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { fetchMe } from '@/api/companion-client';
import type { MeResponse } from '@/api/types';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';

export default function MeScreen() {
  const { pushError } = useErrorBanner();
  const { session, signOut } = useSession();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadMe() {
      try {
        const payload = await fetchMe();
        if (isMounted) {
          setMe(payload);
        }
      } catch {
        pushError('Could not load account details.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadMe();
    return () => {
      isMounted = false;
    };
  }, [pushError]);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  }

  if (isLoading) {
    return <LoadingScreen label="Loading account..." />;
  }

  const email = me?.email ?? session?.email ?? '';

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar title="Me" />
      <View className="mx-auto w-full max-w-3xl flex-1 gap-4 px-4 py-6">
        <View className="rounded-lg border border-app-line bg-app-card p-5">
          <Text className="text-sm font-medium text-app-muted">Account</Text>
          <Text className="mt-2 text-2xl font-semibold text-app-text">{me?.display_name ?? email}</Text>
          <Text className="mt-1 text-sm text-app-muted">{email}</Text>
        </View>

        <View className="rounded-lg border border-app-line bg-app-card p-5">
          <Text className="text-sm font-medium text-app-muted">Sign-in methods</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {(me?.linked_providers?.length ? me.linked_providers : ['email']).map((provider) => (
              <View key={provider} className="rounded-full bg-app-primarySoft px-3 py-1">
                <Text className="text-sm font-semibold text-app-primary">{provider}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="mt-auto">
          <Button isLoading={isSigningOut} label="Sign out" onPress={handleSignOut} variant="secondary" />
        </View>
      </View>
    </View>
  );
}
