import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import { mediaSource } from '@/api/companion-client';
import type { Scene } from '@/api/types';
import { WebAppShell } from '@/components/web/WebAppShell';
import {
  WebEmptyState,
  WebLoading,
  WebStat,
  WebTag,
} from '@/components/web/ui';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useScenes } from '@/hooks/use-scenes';

export default function WebScenesScreen() {
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const { data, error, isLoading, refetch } = useScenes();

  if (isLoading) {
    return <WebLoading label="Curating the city's rooms..." />;
  }

  const scenes = data?.scenes ?? [];
  const unlocked = scenes.filter((s) => s.unlocked);
  const locked = scenes.filter((s) => !s.unlocked);
  const totalCompanions = scenes.reduce((acc, s) => acc + s.potential_companions.length, 0);

  return (
    <WebAppShell
      title="Scenes"
      subtitle="Walk into a room, see who is already there, and let the conversation choose its own direction."
    >
      <View className="mb-7">
        <Text className="font-serif text-display-sm text-white">Scenes</Text>
        <Text className="mt-2 max-w-2xl text-body-sm leading-6 text-rose-50/60">
          Walk into a room, see who is already there, and let the conversation choose its own direction.
        </Text>
      </View>

      <View className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <WebStat eyebrow="Total" value={String(scenes.length)} description="Locations open to you" icon={<Ionicons color={PALETTE.roseDeep} name="map-outline" size={16} />} />
        <WebStat eyebrow="Unlocked" value={String(unlocked.length)} description="Free to step into" icon={<Ionicons color={PALETTE.success} name="lock-open-outline" size={16} />} />
        <WebStat eyebrow="Companions" value={String(totalCompanions)} description="Across the city" icon={<Ionicons color={PALETTE.ember} name="people-outline" size={16} />} />
      </View>

      {error ? (
        <WebEmptyState
          actionLabel="Try again"
          description="Scene data could not be loaded."
          onAction={refetch}
          title="Scenes are unavailable"
        />
      ) : scenes.length === 0 ? (
        <WebEmptyState
          actionLabel="Refresh"
          description="No scenes are active yet."
          onAction={refetch}
          title="No scenes yet"
        />
      ) : (
        <View className="gap-12">
          {unlocked.length > 0 ? (
            <View className="gap-5">
              <View>
                <Text className="text-overline text-app-rose-deep">Open doors</Text>
                <Text className="mt-1 font-serif text-title text-app-ink">Scenes you can step into</Text>
              </View>
              <View className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {unlocked.map((scene) => (
                  <SceneTile
                    key={scene.id}
                    scene={scene}
                    onPress={() => router.push(`/scene/${encodeURIComponent(scene.id)}` as Href)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {locked.length > 0 ? (
            <View className="gap-5">
              <View>
                <Text className="text-overline text-rose-50/60">Still sealed</Text>
                <Text className="mt-1 font-serif text-title text-white">Scenes waiting for a relationship</Text>
              </View>
              <View className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {locked.map((scene) => (
                  <SceneTile
                    key={scene.id}
                    scene={scene}
                    onPress={() => {
                      const hint = formatUnlockHint(scene.unlock_hint);
                      pushError(hint || 'This scene is still locked.');
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      )}
    </WebAppShell>
  );
}

function SceneTile({ onPress, scene }: { onPress: () => void; scene: Scene }) {
  const imageSource = mediaSource(scene.art_url);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className={`group overflow-hidden rounded-2xl border bg-app-surface shadow-card transition-all ${
        scene.unlocked ? 'border-app-line hover:border-app-rose/50 hover:shadow-glow' : 'border-app-line opacity-90'
      }`}
    >
      <View className="relative aspect-[16/9] overflow-hidden bg-white/[0.075]">
        {imageSource ? (
          <>
            <Image source={imageSource} resizeMode="cover" blurRadius={16} className="absolute inset-0 h-full w-full opacity-30" />
            <View pointerEvents="none" className="absolute inset-0 bg-app-twilight/25" />
            <Image
              accessibilityLabel={scene.name}
              source={imageSource}
              resizeMode="contain"
              className="relative z-10 h-full w-full"
            />
          </>
        ) : (
          <View className="h-full w-full items-center justify-center bg-gradient-warm">
            <Text className="font-serif text-display-sm text-app-rose-deep/40">{scene.name.slice(0, 1)}</Text>
          </View>
        )}
        {!scene.unlocked ? (
          <View pointerEvents="none" className="absolute inset-0 bg-app-brand-soft/25" />
        ) : null}
        <View className="absolute right-4 top-4">
          {scene.unlocked ? (
            <View className="rounded-full border border-white/10 bg-black/65 px-3 py-1">
              <Text className="text-caption font-semibold text-white">
                {scene.potential_companions.length} companion{scene.potential_companions.length === 1 ? '' : 's'}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-1.5 rounded-full bg-app-twilight px-3 py-1">
              <Ionicons color={PALETTE.ember} name="lock-closed" size={12} />
              <Text className="text-caption font-semibold text-white">Locked</Text>
            </View>
          )}
        </View>
      </View>
      <View className="gap-4 p-5">
        <Text className="font-serif text-title-sm text-white">{scene.name}</Text>
        <Text className="text-body-sm leading-6 text-rose-50/75" numberOfLines={2}>{scene.mood}</Text>
        {scene.tags.length ? (
          <View className="flex-row flex-wrap gap-1.5">
            {scene.tags.slice(0, 4).map((tag) => (
              <WebTag key={tag} variant="neutral" size="sm">
                {tag}
              </WebTag>
            ))}
          </View>
        ) : null}
        <View className="flex-row items-center justify-between border-t border-white/8 pt-3">
          <Text className="text-caption text-rose-50/60">
            {scene.unlocked ? 'Tap to enter' : formatUnlockHint(scene.unlock_hint) || 'Reach a relationship threshold'}
          </Text>
          <Ionicons
            color={PALETTE.muted}
            name={scene.unlocked ? 'arrow-forward' : 'lock-closed-outline'}
            size={16}
          />
        </View>
      </View>
    </Pressable>
  );
}

function formatUnlockHint(hint: Scene['unlock_hint']): string {
  if (!hint) return '';
  if (typeof hint === 'string') return hint;
  const subject = hint.label ?? hint.companion_id ?? 'a companion';
  const dimension = hint.dimension ? hint.dimension.replace(/_/g, ' ') : 'relationship';
  return `Requires ${subject} ${dimension} ≥ ${hint.value ?? 0}`;
}
