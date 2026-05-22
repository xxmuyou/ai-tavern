import { Redirect } from 'expo-router';
import { PropsWithChildren } from 'react';

import { LoadingScreen } from '@/components/LoadingScreen';
import { AUTH_LOGIN_ROUTE } from '@/constants/routes';
import { useSession } from '@/hooks/use-session';

export function AuthGuard({ children }: PropsWithChildren) {
  const { isLoading, session } = useSession();

  if (isLoading) {
    return <LoadingScreen label="检查登录状态..." />;
  }

  if (!session) {
    return <Redirect href={AUTH_LOGIN_ROUTE} />;
  }

  return children;
}
