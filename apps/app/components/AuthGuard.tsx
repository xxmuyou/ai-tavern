import { Redirect, usePathname, type Href } from 'expo-router';
import { PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { LoadingScreen } from '@/components/LoadingScreen';
import { AUTH_LOGIN_ROUTE } from '@/constants/routes';
import { useSession } from '@/hooks/use-session';

export function AuthGuard({ children }: PropsWithChildren) {
  const { isLoading, session } = useSession();
  const pathname = usePathname();

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (!session) {
    if (Platform.OS === 'web') {
      const query = typeof window === 'undefined' ? '' : window.location.search;
      const redirect = `${pathname}${query}`;
      return <Redirect href={`${AUTH_LOGIN_ROUTE}?redirect=${encodeURIComponent(redirect)}` as Href} />;
    }
    return <Redirect href={AUTH_LOGIN_ROUTE} />;
  }

  return children;
}
