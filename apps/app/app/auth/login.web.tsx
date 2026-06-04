import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

import { LoadingScreen } from '@/components/LoadingScreen';
import { WebPublicCompanionHome } from '@/components/web/WebPublicCompanionHome';
import { SCENES_ROUTE } from '@/constants/routes';
import { useSession } from '@/hooks/use-session';

export default function WebLoginScreen() {
  const params = useLocalSearchParams<{ redirect?: string }>();
  const { isLoading, session } = useSession();

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (session) {
    return <Redirect href={(params.redirect || SCENES_ROUTE) as Href} />;
  }

  return <WebPublicCompanionHome />;
}
