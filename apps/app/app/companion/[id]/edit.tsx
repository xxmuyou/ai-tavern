import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { updateCompanion, uploadCompanionArt } from '@/api/companion-client';
import type { CompanionCreateInput } from '@/api/types';
import { CompanionForm } from '@/components/CompanionForm';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { useCompanion } from '@/hooks/use-companions';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useScenes } from '@/hooks/use-scenes';
import { shareCompanionCard } from '@/utils/share-card';

export default function CompanionEditScreen() {
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
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Edit companion" />
        <EmptyState description="Only your custom companions can be edited." title="Companion cannot be edited" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar
        showBack
        title={`Edit ${companion.data.name}`}
        right={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Export character card"
            onPress={() => {
              void shareCompanionCard(companionId, companion.data?.name ?? 'character').catch((err) =>
                pushError(err instanceof Error ? err.message : 'Could not export this card.'),
              );
            }}
            className="h-10 w-10 items-center justify-center rounded-lg border border-app-line bg-app-card"
          >
            <Ionicons color="#687076" name="share-outline" size={18} />
          </Pressable>
        )}
      />
      <CompanionForm
        initial={companion.data}
        isSubmitting={isSubmitting}
        mode="edit"
        onPickArt={pickNativeArt}
        onSubmit={submit}
        scenes={scenes.data?.scenes}
      />
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
