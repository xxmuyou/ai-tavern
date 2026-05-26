import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { updateCompanion, uploadCompanionArt } from '@/api/companion-client';
import type { CompanionCreateInput } from '@/api/types';
import { CompanionForm } from '@/components/CompanionForm';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAppShell } from '@/components/web/WebAppShell';
import { useCompanion } from '@/hooks/use-companions';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useScenes } from '@/hooks/use-scenes';

export default function WebCompanionEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companionId = Array.isArray(id) ? id[0] : id;
  const companion = useCompanion(companionId);
  const scenes = useScenes();
  const { pushError } = useErrorBanner();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(input: CompanionCreateInput) {
    setIsSubmitting(true);
    try {
      const updated = await updateCompanion(companionId, input);
      router.replace(`/companion/${encodeURIComponent(updated.id)}` as Href);
    } catch (error) {
      pushError(error instanceof Error ? error.message : 'Companion could not be updated.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (companion.isLoading) {
    return <LoadingScreen label="Loading companion..." />;
  }

  if (companion.error || !companion.data || companion.data.source !== 'user') {
    return (
      <WebAppShell title="Edit companion" subtitle="Only your custom companions can be edited.">
        <EmptyState description="Only your custom companions can be edited." title="Companion cannot be edited" />
      </WebAppShell>
    );
  }

  return (
    <WebAppShell title={`Edit ${companion.data.name}`} subtitle="Update the private character card and portrait.">
      <CompanionForm
        initial={companion.data}
        isSubmitting={isSubmitting}
        mode="edit"
        onPickArt={pickWebArt}
        onSubmit={submit}
        scenes={scenes.data?.scenes}
      />
    </WebAppShell>
  );
}

async function pickWebArt(): Promise<string | null> {
  const file = await selectImageFile();
  if (!file) {
    return null;
  }
  const uploaded = await uploadCompanionArt(file);
  return uploaded.key;
}

function selectImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
