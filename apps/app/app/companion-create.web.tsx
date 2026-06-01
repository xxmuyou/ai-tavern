import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';

import { createCompanion, uploadCompanionArt } from '@/api/companion-client';
import type { CompanionCreateInput } from '@/api/types';
import { BaseArtPanel } from '@/components/BaseArtPanel';
import { CompanionForm } from '@/components/CompanionForm';
import { WebAppShell } from '@/components/web/WebAppShell';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useScenes } from '@/hooks/use-scenes';

export default function WebCompanionCreateScreen() {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const scenes = useScenes();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [artKey, setArtKey] = useState<string | null>(null);

  async function submit(input: CompanionCreateInput) {
    setIsSubmitting(true);
    try {
      const companion = await createCompanion(input);
      router.replace(`/companion/${encodeURIComponent(companion.id)}` as Href);
    } catch (error) {
      pushError(error instanceof Error ? error.message : 'Companion could not be created.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function confirmArt(key: string) {
    setArtKey(key);
  }

  return (
    <WebAppShell
      title="Create companion"
      subtitle={artKey ? 'Fill in the character card to finish.' : 'Pick a style and describe the portrait to generate.'}
    >
      {artKey ? (
        <CompanionForm
          initialArtUrl={artKey}
          isSubmitting={isSubmitting}
          mode="create"
          onPickArt={pickWebArt}
          onSubmit={submit}
          scenes={scenes.data?.scenes}
        />
      ) : (
        <BaseArtPanel onConfirm={confirmArt} onUploadArt={pickWebArt} />
      )}
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
