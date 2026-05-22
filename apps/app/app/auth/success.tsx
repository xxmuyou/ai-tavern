import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { useSession } from '@/hooks/use-session';

const errorMessages: Record<string, string> = {
  email_unverified: '您的 Google 账户邮箱尚未验证，请验证后重试',
  invalid_magic_link: '此登录链接已失效，请重新发送',
  invalid_oauth_state: '登录会话已过期，请重试',
  invalid_oauth_token: '第三方登录验证失败，请重试',
  provider_not_configured: '该登录方式暂未开放',
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
        router.replace('/(tabs)/scenes');
        return;
      }
      setError('登录信息无效，请重新登录');
      return;
    }

    if (code) {
      setError(errorMessages[code] ?? '登录失败，请稍后重试');
      return;
    }

    router.replace('/auth/login');
  }, [acceptSessionFragment, router]);

  if (!error) {
    return <LoadingScreen label="正在完成登录..." />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-app-bg px-6">
      <View className="w-full max-w-md rounded-lg border border-app-line bg-app-card p-6">
        <Text className="text-center text-2xl font-semibold text-app-text">登录失败</Text>
        <Text className="mt-3 text-center text-sm leading-5 text-app-muted">{error}</Text>
        <View className="mt-6">
          <Button label="重新登录" onPress={() => router.replace('/auth/login')} />
        </View>
      </View>
    </View>
  );
}
