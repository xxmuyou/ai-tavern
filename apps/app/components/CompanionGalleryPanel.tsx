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

const CELL_WIDTH = 120;
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
    <View className="gap-5 rounded-3xl border border-app-rose/20 bg-app-rose-soft/70 p-5 shadow-card">
      <View className="gap-2">
        <View className="flex-row items-center justify-between gap-3">
          <View>
            <Text className="font-serif text-title text-app-ink">Portraits</Text>
            <Text className="mt-1 text-overline text-app-rose-deep">Emotion unlock gallery</Text>
          </View>
          <View className="rounded-full border border-app-rose/25 bg-app-canvas px-3 py-1">
            <Text className="text-caption font-semibold text-app-rose-deep">
              {viewerEmotions.length}/{EMOTION_ORDER.length} unlocked
            </Text>
          </View>
        </View>
        <Text className="text-body-sm leading-6 text-app-ink-soft">
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
        className={`overflow-hidden rounded-2xl border shadow-sm ${
          unlocked ? 'border-app-rose/20 bg-app-canvas' : 'border-app-ember/25 bg-app-ember-soft'
        }`}
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

      <View className="mt-2 flex-row items-center justify-center gap-1">
        {!unlocked ? <Text className="text-xs text-app-rose-deep">Locked</Text> : null}
        <Text className={`text-caption font-semibold ${unlocked ? 'text-app-ink' : 'text-app-rose-deep'}`}>{label}</Text>
      </View>
      {!unlocked ? (
        <Text className="mt-1 text-center text-[11px] font-semibold leading-4 text-app-ink-soft">
          {errored ? 'Failed - tap to retry' : isPro ? 'Tap to unlock' : 'Subscribe to unlock'}
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
          backgroundColor: 'rgba(42,31,26,0.26)',
        }}
      />
      <View className="rounded-full border border-app-canvas/70 bg-app-canvas/90 px-3 py-2">
        {busy ? <ActivityIndicator color="#9A2F4F" /> : <Text className="text-caption font-bold text-app-rose-deep">LOCKED</Text>}
      </View>
    </View>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
