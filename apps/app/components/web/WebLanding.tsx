import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ImageBackground, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useSession } from '@/hooks/use-session';

const HERO_IMAGE = require('../../assets/ai-companion/scenes/pier_coffee_shop.png');

export function WebLanding() {
  const router = useRouter();
  const { sendMagicLink, signInGoogle } = useSession();
  const { pushError } = useErrorBanner();
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
      const response = await sendMagicLink(trimmed);
      setNotice(response.verify_url ? `Sign-in link is ready for ${trimmed}.` : `A sign-in link has been sent to ${trimmed}.`);
    } catch {
      pushError('Could not send the sign-in link. Please try again later.');
    } finally {
      setIsSendingLink(false);
    }
  }

  return (
    <View className="min-h-screen flex-1 bg-[#F2F5F6]">
      <View className="mx-auto min-h-screen w-full max-w-[1440px] px-8 py-8">
        <View className="mb-8 flex-row items-center justify-between">
          <Text className="text-2xl font-semibold text-app-text">AI Apps Box</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/auth/login')} className="rounded-md border border-app-line bg-white px-4 py-2">
            <Text className="text-sm font-semibold text-app-text">Sign in</Text>
          </Pressable>
        </View>

        <View className="overflow-hidden rounded-lg border border-app-line bg-white">
          <ImageBackground source={HERO_IMAGE} resizeMode="cover" className="min-h-[520px] justify-end">
            <View className="absolute inset-0 bg-black/35" />
            <View className="w-full max-w-4xl px-10 py-12">
              <Text className="text-6xl font-semibold leading-tight text-white">AI Apps Box</Text>
              <Text className="mt-4 max-w-2xl text-xl leading-8 text-white">
                A web-first relationship sandbox for scenes, companions, memory, billing, and admin control.
              </Text>
            </View>
          </ImageBackground>

          <View className="grid grid-cols-1 gap-8 p-8 md:grid-cols-3">
            <View className="md:col-span-2">
              <Text className="text-3xl font-semibold text-app-text">Enter the dev workspace</Text>
              <Text className="mt-3 max-w-2xl text-base leading-7 text-app-muted">
                Explore scenes, talk with companions, verify subscriptions, and manage the dev login allowlist from one desktop surface.
              </Text>
              <View className="mt-8 flex-row gap-4">
                {['Scene browsing', 'Streaming chat', 'Admin tools'].map((item) => (
                  <View key={item} className="flex-row items-center gap-2 rounded-full bg-app-primarySoft px-4 py-2">
                    <Ionicons color="#1E6B52" name="checkmark-circle" size={16} />
                    <Text className="text-sm font-semibold text-app-primary">{item}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="rounded-lg border border-app-line bg-app-bg p-5">
              <Text className="text-lg font-semibold text-app-text">Sign in</Text>
              <Text className="mt-1 text-sm text-app-muted">Continue with Google or get a magic link.</Text>
              <View className="mt-5 gap-3">
                <Button label="Continue with Google" onPress={signInGoogle} />
                <View className="my-1 flex-row items-center gap-3">
                  <View className="h-px flex-1 bg-app-line" />
                  <Text className="text-xs uppercase tracking-normal text-app-muted">or email</Text>
                  <View className="h-px flex-1 bg-app-line" />
                </View>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor="#8B949E"
                  value={email}
                  className="min-h-12 rounded-md border border-app-line bg-white px-4 text-base text-app-text"
                />
                <Button isLoading={isSendingLink} label="Send sign-in link" onPress={handleSendLink} variant="secondary" />
                {notice ? <Text className="text-sm leading-5 text-app-primary">{notice}</Text> : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
