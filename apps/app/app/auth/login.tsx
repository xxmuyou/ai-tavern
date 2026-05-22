import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { API_BASE_URL } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
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
    return <LoadingScreen label="检查登录状态..." />;
  }

  if (session) {
    return <Redirect href="/(tabs)/scenes" />;
  }

  async function handleMagicLink() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      pushError('请输入邮箱');
      return;
    }

    setIsSendingLink(true);
    setNotice(null);
    try {
      await sendMagicLink(trimmedEmail);
      setNotice(`登录链接已发送至 ${trimmedEmail}，请在 15 分钟内点击`);
    } catch {
      pushError('登录链接发送失败，请稍后重试');
    } finally {
      setIsSendingLink(false);
    }
  }

  async function handleDevSignIn() {
    const trimmedEmail = devEmail.trim();
    if (!trimmedEmail) {
      pushError('请输入 Dev 邮箱');
      return;
    }

    setIsSigningInDev(true);
    try {
      await signInDev(trimmedEmail);
      router.replace('/(tabs)/scenes');
    } catch {
      pushError('Dev 登录失败');
    } finally {
      setIsSigningInDev(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-5 py-10">
      <View className="w-full max-w-md rounded-lg border border-app-line bg-app-card p-6 shadow-sm">
        <Text className="text-center text-3xl font-semibold text-app-text">XTBit</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-app-muted">登录后进入都市奇幻人际沙盒。</Text>

        <View className="mt-8 gap-3">
          <Text className="text-sm font-semibold text-app-text">邮箱登录</Text>
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
          <Button isLoading={isSendingLink} label="发送登录链接" onPress={handleMagicLink} />
          {notice ? <Text className="text-sm leading-5 text-app-primary">{notice}</Text> : null}
        </View>

        <View className="mt-5">
          <Button label="使用 Google 登录" onPress={signInGoogle} variant="secondary" />
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
