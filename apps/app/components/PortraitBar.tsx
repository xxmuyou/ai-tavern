import { Image, Text, View } from 'react-native';

import { mediaSource } from '@/api/companion-client';
import type { ChatEmotionKey } from '@/api/types';
import type { ChatEmotion } from '@/hooks/use-chat-stream';

type ArtEmotions = Partial<Record<ChatEmotionKey, string>> | null | undefined;

type PortraitBarProps = {
  artEmotions?: ArtEmotions;
  artUrl?: string | null;
  emotion: ChatEmotion | null;
  name: string;
  sceneArt?: string | null;
};

const CONTAINER_HEIGHT = 280;
const PORTRAIT_ASPECT = 1023 / 1535;

const EMOTION_LABEL: Record<ChatEmotion, string> = {
  annoyed: 'annoyed',
  guarded: 'guarded',
  neutral: 'neutral',
  playful: 'playful',
  tense: 'tense',
  warm: 'warm',
};

const EMOTION_EMOJI: Record<ChatEmotion, string> = {
  annoyed: '😤',
  guarded: '😶',
  neutral: '😐',
  playful: '😏',
  tense: '😟',
  warm: '😊',
};

const EMOTION_TINT: Record<ChatEmotion, string> = {
  annoyed: '#C0524A',
  guarded: '#6E7B8A',
  neutral: '#8C8F94',
  playful: '#D4A33C',
  tense: '#A85A8E',
  warm: '#E89B6A',
};

function resolvePortrait(artEmotions: ArtEmotions, artUrl: string | null | undefined, emotion: ChatEmotion) {
  const raw = (artEmotions && artEmotions[emotion]) || artUrl || null;
  return mediaSource(raw);
}

export function PortraitBar({ artEmotions, artUrl, emotion, name, sceneArt }: PortraitBarProps) {
  const activeEmotion: ChatEmotion = emotion ?? 'neutral';
  const portraitSource = resolvePortrait(artEmotions, artUrl, activeEmotion);
  const sceneSource = mediaSource(sceneArt);
  const tint = EMOTION_TINT[activeEmotion];
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View
      className="border-b border-app-line"
      style={{ height: CONTAINER_HEIGHT, overflow: 'hidden', backgroundColor: tint }}
    >
      {sceneSource ? (
        <Image
          accessibilityIgnoresInvertColors
          source={sceneSource}
          resizeMode="cover"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}

      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        {portraitSource ? (
          <Image
            accessibilityLabel={`${name}, ${EMOTION_LABEL[activeEmotion]}`}
            source={portraitSource}
            resizeMode="contain"
            style={{ height: '100%', aspectRatio: PORTRAIT_ASPECT }}
          />
        ) : (
          <Placeholder activeEmotion={activeEmotion} initial={initial} />
        )}
      </View>

      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 56,
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      />

      <View
        className="absolute bottom-2 right-3 flex-row items-center rounded-full bg-black/50 px-3 py-1"
        pointerEvents="none"
      >
        <Text className="text-sm font-medium text-white">{name}</Text>
        <Text className="ml-2 text-xs text-white/80">{EMOTION_EMOJI[activeEmotion]} {EMOTION_LABEL[activeEmotion]}</Text>
      </View>
    </View>
  );
}

function Placeholder({
  activeEmotion,
  initial,
}: {
  activeEmotion: ChatEmotion;
  initial: string;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 64,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.25)',
          borderRadius: 56,
          height: 112,
          justifyContent: 'center',
          width: 112,
        }}
      >
        <Text style={{ color: 'white', fontSize: 44, fontWeight: '700' }}>{initial}</Text>
      </View>
      <Text style={{ fontSize: 28, marginTop: 8 }}>{EMOTION_EMOJI[activeEmotion]}</Text>
    </View>
  );
}
