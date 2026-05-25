import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/components/LoadingScreen';
import { WebLanding } from '@/components/web/WebLanding';
import { SCENES_ROUTE } from '@/constants/routes';
import { useSession } from '@/hooks/use-session';

export default function WebLoginScreen() {
  const { isLoading, session } = useSession();

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (session) {
    return <Redirect href={SCENES_ROUTE} />;
  }

  return <WebLanding />;
}
