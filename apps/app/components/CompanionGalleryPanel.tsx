import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';

import {
  generateCompanionEmotionArt,
  listCompanionEmotionArtJobs,
  mediaSource,
} from '@/api/companion-client';
import type { ChatEmotionKey } from '@/api/types';
import { PortraitViewerModal, type ViewerEmotion } from '@/components/PortraitViewerModal';
import { useBilling } from '@/hooks/use-billing';
import { EMOTION_LABEL, EMOTION_ORDER, PORTRAIT_ASPECT, type ArtEmotions } from '@/utils/portrait';

const CELL_WIDTH = 104;
const CELL_HEIGHT = Math.round(CELL_WIDTH / PORTRAIT_ASPECT);
const BILLING_ROUTE = '/billing' as Href;
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 60;

type CompanionGalleryPanelProps = {
  companionId: string;
  name: string;
  artEmotions: ArtEmotions;
  artUrl: string | null;
};

/**
 * Portrait gallery on the companion profile. Each of the six emotion portraits
 * is a cell: unlocked ones (art already generated) show a tappable thumbnail
 * (full screen on tap); locked ones show the blurred neutral portrait under a
 * lock. Generating a locked expression is subscription-gated and manual — Pro
 * users tap to unlock+generate, free users are sent to subscribe. See the
 * backend gate in packages/api/src/companions/emotion-art-routes.ts.
 */
export function CompanionGalleryPanel({ companionId, name, artEmotions, artUrl }: CompanionGalleryPanelProps) {
  const router = useRouter();
  const { data: billing } = useBilling();
  const isPro = billing?.subscription.tier === 'pro';

  const [viewerEmotion, setViewerEmotion] = useState<ChatEmotionKey | null>(null);
  // Locally merged art so a freshly generated expression shows without a reload.
  const [generated, setGenerated] = useState<Partial<Record<ChatEmotionKey, string>>>({});
  const [busyEmotion, setBusyEmotion] = useState<ChatEmotionKey | null>(null);
  const [errorEmotion, setErrorEmotion] = useState<ChatEmotionKey | null>(null);

  const blurredNeutral = useMemo(() => mediaSource(artEmotions?.neutral ?? artUrl), [artEmotions, artUrl]);

  const cells = useMemo(
    () =>
      EMOTION_ORDER.map((emotion) => {
        const raw = generated[emotion] ?? artEmotions?.[emotion] ?? (emotion === 'neutral' ? artUrl : null);
        return { emotion, source: mediaSource(raw), unlocked: Boolean(raw) };
      }),
    [artEmotions, artUrl, generated],
  );

  const viewerEmotions: ViewerEmotion[] = useMemo(
    () =>
      cells
        .filter((cell) => cell.unlocked && cell.source)
        .map((cell) => ({ key: cell.emotion, source: cell.source! })),
    [cells],
  );

  const unlock = useCallback(
    async (emotion: ChatEmotionKey) => {
      if (emotion === 'neutral') return;
      if (!isPro) {
        router.push(BILLING_ROUTE);
        return;
      }
      setBusyEmotion(emotion);
      setErrorEmotion(null);
      try {
        const res = await generateCompanionEmotionArt(companionId, emotion);
        if (res.status === 'cached') {
          setGenerated((prev) => ({ ...prev, [emotion]: res.key }));
          return;
        }
        const jobId = res.job_id;
        for (let i = 0; i < MAX_POLLS; i += 1) {
          await delay(POLL_INTERVAL_MS);
          const payload = await listCompanionEmotionArtJobs(companionId);
          const job = payload.jobs.find((item) => item.id === jobId);
          if (job?.status === 'succeeded' && job.output_key) {
            setGenerated((prev) => ({ ...prev, [emotion]: job.output_key! }));
            return;
          }
          if (job?.status === 'failed' || job?.status === 'cancelled') {
            setErrorEmotion(emotion);
            return;
          }
        }
        setErrorEmotion(emotion);
      } catch {
        // Most likely subscription_required (race) or a transient error.
        setErrorEmotion(emotion);
      } finally {
        setBusyEmotion(null);
      }
    },
    [companionId, isPro, router],
  );

  return (
    <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5 web:bg-white">
      <View className="gap-1">
        <Text className="text-xl font-semibold text-app-text">Portraits</Text>
        <Text className="text-sm text-app-muted">
          {isPro
            ? 'Tap a locked portrait to unlock and generate it. Tap an unlocked one to view it full screen.'
            : 'Subscribe to unlock more expressions. Tap an unlocked portrait to view it full screen.'}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        {cells.map((cell) => (
          <PortraitCell
            key={cell.emotion}
            blurredNeutral={blurredNeutral}
            busy={busyEmotion === cell.emotion}
            emotion={cell.emotion}
            errored={errorEmotion === cell.emotion}
            isPro={isPro}
            name={name}
            source={cell.unlocked ? cell.source : null}
            unlocked={cell.unlocked}
            onPress={
              cell.unlocked && cell.source
                ? () => setViewerEmotion(cell.emotion)
                : cell.emotion === 'neutral'
                  ? undefined
                  : () => void unlock(cell.emotion)
            }
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
  blurredNeutral: ReturnType<typeof mediaSource>;
  busy: boolean;
  emotion: ChatEmotionKey;
  errored: boolean;
  isPro: boolean;
  name: string;
  source: ReturnType<typeof mediaSource>;
  unlocked: boolean;
  onPress?: () => void;
};

function PortraitCell({
  blurredNeutral,
  busy,
  emotion,
  errored,
  isPro,
  name,
  source,
  unlocked,
  onPress,
}: PortraitCellProps) {
  const label = EMOTION_LABEL[emotion];

  return (
    <View style={{ width: CELL_WIDTH }}>
      <Pressable
        accessibilityLabel={unlocked ? `${name}, ${label}` : `${label}, locked`}
        accessibilityRole={onPress ? 'button' : 'image'}
        disabled={!onPress || busy}
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
          <LockedCell blurredNeutral={blurredNeutral} busy={busy} />
        )}
      </Pressable>

      <View className="mt-1.5 flex-row items-center justify-center gap-1">
        {!unlocked ? <Text className="text-xs">🔒</Text> : null}
        <Text className={`text-xs font-medium ${unlocked ? 'text-app-text' : 'text-app-muted'}`}>{label}</Text>
      </View>
      {!unlocked ? (
        <Text className="mt-0.5 text-center text-[11px] leading-4 text-app-muted">
          {errored ? 'Failed — tap to retry' : isPro ? 'Tap to unlock' : 'Subscribe to unlock'}
        </Text>
      ) : null}
    </View>
  );
}

function LockedCell({
  blurredNeutral,
  busy,
}: {
  blurredNeutral: ReturnType<typeof mediaSource>;
  busy: boolean;
}) {
  return (
    <View className="h-full w-full items-center justify-center">
      {blurredNeutral ? (
        <Image
          accessibilityIgnoresInvertColors
          blurRadius={14}
          resizeMode="contain"
          source={blurredNeutral}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.6 }}
        />
      ) : null}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.28)',
        }}
      />
      {busy ? <ActivityIndicator color="#ffffff" /> : <Text style={{ fontSize: 26 }}>🔒</Text>}
    </View>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
