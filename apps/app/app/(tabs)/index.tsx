import AiCompanionScreen from '@/features/ai-companion/AiCompanionScreen';
import { AiCompanionErrorBoundary } from '@/features/ai-companion/ErrorBoundary';

export default function AiCompanionRoute() {
  return (
    <AiCompanionErrorBoundary>
      <AiCompanionScreen />
    </AiCompanionErrorBoundary>
  );
}
