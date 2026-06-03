import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { CompanionStoryPanel } from '@/components/CompanionStoryPanel';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebCard, WebEmptyState, WebLoading, WebSection } from '@/components/web/ui';
import { COMPANIONS_ROUTE } from '@/constants/routes';
import { useCompanion } from '@/hooks/use-companions';

export default function WebCompanionStorySetupScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companionId = Array.isArray(id) ? id[0] : id;
  const companion = useCompanion(companionId);

  if (companion.isLoading) {
    return <WebLoading label="Loading story setup..." />;
  }

  if (companion.error || !companion.data) {
    return (
      <WebAppShell
        title="Set up story"
        subtitle="This companion could not be loaded."
        breadcrumbs={[{ href: COMPANIONS_ROUTE, label: 'Companions' }]}
      >
        <WebEmptyState
          actionLabel="Back to companions"
          description="The story setup flow could not be opened."
          onAction={() => router.replace(COMPANIONS_ROUTE as Href)}
          title="Story setup unavailable"
        />
      </WebAppShell>
    );
  }

  const detail = companion.data;

  return (
    <WebAppShell
      title="Set up story"
      subtitle={detail.name}
      breadcrumbs={[{ href: COMPANIONS_ROUTE, label: 'Companions' }, { href: `/companion/${encodeURIComponent(detail.id)}` as Href, label: detail.name }, { label: 'Story setup' }]}
    >
      <WebSection
        eyebrow="Story setup"
        title="Choose the next thread"
        description="Pick a story pack, write a lightweight arc, or ask AI for a draft. Sandbox chat stays available even if you skip."
      >
        <View className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr_1fr]">
          <CompanionStoryPanel canEdit companionId={detail.id} onChanged={companion.refetch} />
          <WebCard padding="md" className="gap-4">
            <Text className="font-serif text-title-sm text-app-ink">{detail.name}</Text>
            <Text className="text-body-sm leading-6 text-app-muted">
              A story arc gives Today, Scene, and Chat a clear objective. Completion is manual, so the player decides when a beat is done.
            </Text>
            <View className="gap-2">
              <WebButton
                label="Start chat"
                onPress={() => router.replace(`/chat/${encodeURIComponent(detail.id)}` as Href)}
                variant="primary"
              />
              <WebButton
                label="Open profile"
                onPress={() => router.replace(`/companion/${encodeURIComponent(detail.id)}` as Href)}
                variant="outline"
              />
              <WebButton
                label="Skip for now"
                onPress={() => router.replace(`/companion/${encodeURIComponent(detail.id)}` as Href)}
                variant="ghost"
              />
            </View>
          </WebCard>
        </View>
      </WebSection>
    </WebAppShell>
  );
}
