import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { View } from 'react-native';

import { createCompanion, uploadCompanionArt } from '@/api/companion-client';
import type { CompanionCreateInput } from '@/api/types';
import { BaseArtPanel } from '@/components/BaseArtPanel';
import { CompanionForm } from '@/components/CompanionForm';
import { TopBar } from '@/components/TopBar';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useScenes } from '@/hooks/use-scenes';

export default function CompanionCreateScreen() {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const scenes = useScenes();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [artKey, setArtKey] = useState<string | null>(null);

  async function submit(input: CompanionCreateInput) {
    setIsSubmitting(true);
    try {
      const companion = await createCompanion(input);
      router.replace(`/companion/${encodeURIComponent(companion.id)}/story-setup` as Href);
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
    <View className="flex-1 bg-app-bg">
      <TopBar showBack title="Create companion" />
      {artKey ? (
        <CompanionForm
          initialArtUrl={artKey}
          isSubmitting={isSubmitting}
          mode="create"
          onPickArt={pickNativeArt}
          onSubmit={submit}
          scenes={scenes.data?.scenes}
        />
      ) : (
        <BaseArtPanel onConfirm={confirmArt} onUploadArt={pickNativeArt} />
      )}
    </View>
  );
}

async function pickNativeArt(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: false,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.92,
  });
  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  if (!asset?.uri) {
    return null;
  }

  const mimeType = asset.mimeType ?? mimeTypeFromUri(asset.uri);
  const name = asset.fileName ?? `portrait.${extensionFromMimeType(mimeType)}`;
  const uploaded = await uploadCompanionArt({ name, type: mimeType, uri: asset.uri });
  return uploaded.key;
}

function mimeTypeFromUri(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}
