import { Redirect } from 'expo-router';
import { PropsWithChildren } from 'react';

import { AuthGuard } from '@/components/AuthGuard';
import { LoadingScreen } from '@/components/LoadingScreen';
import { ME_ROUTE } from '@/constants/routes';
import { useMe } from '@/hooks/use-me';

export function AdminGuard({ children }: PropsWithChildren) {
  return (
    <AuthGuard>
      <AdminGate>{children}</AdminGate>
    </AuthGuard>
  );
}

function AdminGate({ children }: PropsWithChildren) {
  const { isLoading, me } = useMe();

  if (isLoading) {
    return <LoadingScreen label="Checking your admin access..." />;
  }

  if (!me?.is_admin) {
    return <Redirect href={ME_ROUTE} />;
  }

  return children;
}
