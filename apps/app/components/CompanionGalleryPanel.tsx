import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import { listCompanionMomentImages, mediaSource } from '@/api/companion-client';
import type { CompanionMomentImage } from '@/api/types';
import { PORTRAIT_ASPECT, type ArtEmotions } from '@/utils/portrait';

const MAIN_WIDTH = 132;
const MAIN_HEIGHT = Math.round(MAIN_WIDTH / PORTRAIT_ASPECT);

type CompanionGalleryPanelProps = {
  companionId: string;
  name: string;
  artEmotions: ArtEmotions;
  artUrl: string | null;
};

export function CompanionGalleryPanel({
  companionId,
  name,
  artUrl,
}: CompanionGalleryPanelProps) {
  const [moments, setMoments] = useState<CompanionMomentImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companionId) return;
    let cancelled = false;

    async function loadMoments() {
      setIsLoading(true);
      setError(null);
      try {
        const payload = await listCompanionMomentImages(companionId);
        if (!cancelled) {
          setMoments(payload.moment_images ?? []);
        }
      } catch {
        if (!cancelled) {
          setError('Moment gallery could not be loaded.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadMoments();
    return () => {
      cancelled = true;
    };
  }, [companionId]);

  const mainSource = mediaSource(artUrl);

  return (
    <View className="gap-5 rounded-3xl border border-app-rose/20 bg-app-rose-soft/70 p-5 shadow-card">
      <View className="gap-1">
        <Text className="font-serif text-title text-app-ink">Gallery</Text>
        <Text className="text-overline text-app-rose-deep">Main portrait + captured moments</Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        <View style={{ width: MAIN_WIDTH }}>
          <View
            className="overflow-hidden rounded-2xl border border-app-rose/20 bg-app-canvas shadow-sm"
            style={{ height: MAIN_HEIGHT, alignItems: 'center', justifyContent: 'flex-end' }}
          >
            {mainSource ? (
              <Image
                accessibilityLabel={`${name}, main portrait`}
                resizeMode="contain"
                source={mainSource}
                style={{ height: '100%', aspectRatio: PORTRAIT_ASPECT }}
              />
            ) : (
              <View className="flex-1 items-center justify-center px-3">
                <Text className="text-center text-sm font-semibold text-app-muted">No portrait yet</Text>
              </View>
            )}
          </View>
          <Text className="mt-2 text-center text-caption font-semibold text-app-ink">Main portrait</Text>
        </View>

        {moments.map((moment) => (
          <MomentCell key={moment.id} moment={moment} name={name} />
        ))}
      </View>

      {isLoading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator color={PALETTE.roseDeep} />
          <Text className="text-sm text-app-muted">Loading moments...</Text>
        </View>
      ) : null}

      {!isLoading && moments.length === 0 ? (
        <Text className="text-body-sm leading-6 text-app-ink-soft">
          Captured chat moments will appear here after you use the camera button on a companion reply.
        </Text>
      ) : null}

      {error ? (
        <Text className="text-sm font-semibold text-app-rose-deep">{error}</Text>
      ) : null}
    </View>
  );
}

function MomentCell({ moment, name }: { moment: CompanionMomentImage; name: string }) {
  const source = mediaSource(moment.output_key);
  const isReady = moment.status === 'succeeded' && source;

  return (
    <View style={{ width: MAIN_WIDTH }}>
      <View
        className="overflow-hidden rounded-2xl border border-app-rose/20 bg-app-canvas shadow-sm"
        style={{ height: MAIN_HEIGHT, alignItems: 'center', justifyContent: 'center' }}
      >
        {isReady ? (
          <Image
            accessibilityLabel={`${name}, captured moment`}
            resizeMode="cover"
            source={source}
            style={{ height: '100%', width: '100%' }}
          />
        ) : (
          <View className="items-center gap-2 px-3">
            <ActivityIndicator color={PALETTE.roseDeep} />
            <Text className="text-center text-xs font-semibold text-app-muted">Generating</Text>
          </View>
        )}
      </View>
    </View>
  );
}
