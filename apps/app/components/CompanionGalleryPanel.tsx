import { useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { ChatEmotionKey } from '@/api/types';
import { PortraitViewerModal, type ViewerEmotion } from '@/components/PortraitViewerModal';
import { useCompanionUnlocks } from '@/hooks/use-companions';
import { isEmotionUnlocked } from '@/utils/expression-unlock';
import { EMOTION_EMOJI, EMOTION_LABEL, EMOTION_ORDER, PORTRAIT_ASPECT, type ArtEmotions } from '@/utils/portrait';

const CELL_WIDTH = 104;
const CELL_HEIGHT = Math.round(CELL_WIDTH / PORTRAIT_ASPECT);

type CompanionGalleryPanelProps = {
  companionId: string;
  name: string;
  artEmotions: ArtEmotions;
  artUrl: string | null;
};

function prettyStage(stage: string): string {
  return stage
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * spec-025 §B5: portrait gallery on the companion profile. Shows the six
 * emotion portraits as a grid — unlocked ones as tappable thumbnails (full
 * screen on tap), locked ones as a placeholder with the stage still to reach.
 * Fixes the gap where unlocked portraits could only be seen passively in chat.
 */
export function CompanionGalleryPanel({ companionId, name, artEmotions, artUrl }: CompanionGalleryPanelProps) {
  const { data } = useCompanionUnlocks(companionId);
  const [viewerEmotion, setViewerEmotion] = useState<ChatEmotionKey | null>(null);

  // Map each gated emotion to the stage required, derived from `expr:<emotion>`
  // unlock keys so the locked label stays in sync with the backend rules.
  const requiredStageByEmotion = useMemo(() => {
    const map: Partial<Record<ChatEmotionKey, string>> = {};
    for (const item of data?.items ?? []) {
      if (item.kind === 'expression' && item.key.startsWith('expr:')) {
        map[item.key.slice('expr:'.length) as ChatEmotionKey] = item.required_stage;
      }
    }
    return map;
  }, [data]);

  const stage = data?.stage ?? null;

  const cells = useMemo(
    () =>
      EMOTION_ORDER.map((emotion) => {
        const raw = artEmotions?.[emotion] ?? (emotion === 'neutral' ? artUrl : null);
        const source = mediaSource(raw);
        const unlocked = isEmotionUnlocked(emotion, stage);
        return { emotion, source, unlocked, requiredStage: requiredStageByEmotion[emotion] ?? null };
      }),
    [artEmotions, artUrl, stage, requiredStageByEmotion],
  );

  // Emotions that can be opened full screen: unlocked and actually have art.
  const viewerEmotions: ViewerEmotion[] = useMemo(
    () =>
      cells
        .filter((cell) => cell.unlocked && cell.source)
        .map((cell) => ({ key: cell.emotion, source: cell.source! })),
    [cells],
  );

  return (
    <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5 web:bg-white">
      <View className="gap-1">
        <Text className="text-xl font-semibold text-app-text">Portraits</Text>
        <Text className="text-sm text-app-muted">Tap an unlocked portrait to view it full screen.</Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {cells.map((cell) => (
          <PortraitCell
            key={cell.emotion}
            emotion={cell.emotion}
            name={name}
            requiredStage={cell.requiredStage}
            source={cell.unlocked ? cell.source : null}
            unlocked={cell.unlocked}
            onPress={cell.unlocked && cell.source ? () => setViewerEmotion(cell.emotion) : undefined}
          />
        ))}
      </View>

      <PortraitViewerModal
        emotion={viewerEmotion}
        emotions={viewerEmotions}
        name={name}
        onChangeEmotion={setViewerEmotion}
        onClose={() => setViewerEmotion(null)}
        visible={viewerEmotion != null}
      />
    </View>
  );
}

type PortraitCellProps = {
  emotion: ChatEmotionKey;
  name: string;
  requiredStage: string | null;
  source: ReturnType<typeof mediaSource>;
  unlocked: boolean;
  onPress?: () => void;
};

function PortraitCell({ emotion, name, requiredStage, source, unlocked, onPress }: PortraitCellProps) {
  const label = EMOTION_LABEL[emotion];

  return (
    <View style={{ width: CELL_WIDTH }}>
      <Pressable
        accessibilityLabel={unlocked ? `${name}, ${label}` : `${label}, locked`}
        accessibilityRole={onPress ? 'button' : 'image'}
        disabled={!onPress}
        onPress={onPress}
        className="overflow-hidden rounded-lg border border-app-line bg-app-primarySoft"
        style={{ height: CELL_HEIGHT, alignItems: 'center', justifyContent: 'flex-end' }}
      >
        {unlocked && source ? (
          <Image
            accessibilityLabel={`${name}, ${label}`}
            resizeMode="contain"
            source={source}
            style={{ height: '100%', aspectRatio: PORTRAIT_ASPECT }}
          />
        ) : (
          <CellPlaceholder emotion={emotion} locked={!unlocked} />
        )}
      </Pressable>

      <View className="mt-1.5 flex-row items-center justify-center gap-1">
        {!unlocked ? <Text className="text-xs">🔒</Text> : null}
        <Text className={`text-xs font-medium ${unlocked ? 'text-app-text' : 'text-app-muted'}`}>{label}</Text>
      </View>
      {!unlocked && requiredStage ? (
        <Text className="mt-0.5 text-center text-[11px] leading-4 text-app-muted">
          Reach {prettyStage(requiredStage)}
        </Text>
      ) : null}
      {unlocked && !source ? (
        <Text className="mt-0.5 text-center text-[11px] leading-4 text-app-muted">Appears in chat</Text>
      ) : null}
    </View>
  );
}

function CellPlaceholder({ emotion, locked }: { emotion: ChatEmotionKey; locked: boolean }) {
  return (
    <View className="h-full w-full items-center justify-center" style={{ opacity: locked ? 0.55 : 0.8 }}>
      <Text style={{ fontSize: 30 }}>{locked ? '🔒' : EMOTION_EMOJI[emotion]}</Text>
    </View>
  );
}
