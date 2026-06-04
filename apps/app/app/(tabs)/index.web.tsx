import { LoadingScreen } from '@/components/LoadingScreen';
import { WebPublicCompanionHome } from '@/components/web/WebPublicCompanionHome';
import { useSession } from '@/hooks/use-session';

export default function WebIndex() {
  const { isLoading } = useSession();

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  return <WebPublicCompanionHome />;
}
