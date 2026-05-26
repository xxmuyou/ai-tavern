import { LoadingScreen } from '@/components/LoadingScreen';
import { TodayHub } from '@/components/TodayHub';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebLanding } from '@/components/web/WebLanding';
import { useSession } from '@/hooks/use-session';

export default function WebIndex() {
  const { isLoading, session } = useSession();

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  if (session) {
    return (
      <WebAppShell title="Today" subtitle="Daily visits, activities, relationship goals, and memories.">
        <TodayHub web />
      </WebAppShell>
    );
  }

  return <WebLanding />;
}
