import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { getCompanion, mediaSource } from '@/api/companion-client';
import type { ChatEmotionKey, ChatMessage, ChatUnlock, CompanionDetail, NonNeutralChatEmotionKey, RelationshipDimensions } from '@/api/types';
import { ActivityContextBanner } from '@/components/ActivityContextBanner';
import { Button } from '@/components/Button';
import { ChatRelationshipHud } from '@/components/ChatRelationshipHud';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { MessageBubble } from '@/components/MessageBubble';
import { MomentImageCapture } from '@/components/MomentImageCapture';
import { SignalFeedback } from '@/components/SignalFeedback';
import { StreamingBubble } from '@/components/StreamingBubble';
import { UnlockCelebration } from '@/components/UnlockCelebration';
import { WebAppShell, WebPanel } from '@/components/web/WebAppShell';
import { gateEmotion } from '@/utils/expression-unlock';
import { ApiError, QuotaExceededError, RateLimitedError } from '@/hooks/use-api';
import { useActivities, useActivity } from '@/hooks/use-activities';
import { useChatHistory } from '@/hooks/use-chat-history';
import { useChatRelationship } from '@/hooks/use-chat-relationship';
import { CHAT_EMOTIONS, useChatStream, type ChatEmotion } from '@/hooks/use-chat-stream';
import { useOnDemandEmotionArt } from '@/hooks/use-emotion-art';
import { useErrorBanner } from '@/hooks/use-error-banner';

const STREAMING_ID = '__streaming__';

type StreamingItem = {
  __streaming: true;
  id: typeof STREAMING_ID;
  text: string;
};

type ChatListItem = ChatMessage | StreamingItem;

function isStreamingItem(item: ChatListItem): item is StreamingItem {
  return (item as StreamingItem).__streaming === true;
}

export default function WebChatScreen() {
  const params = useLocalSearchParams<{ activityId?: string; companionId?: string; sceneId?: string }>();
  const companionId = typeof params.companionId === 'string' ? params.companionId : '';
  const activityId = typeof params.activityId === 'string' ? params.activityId : undefined;
  const sceneId = typeof params.sceneId === 'string' ? params.sceneId : undefined;
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const history = useChatHistory(companionId);
  const stream = useChatStream(companionId);
  const relationship = useChatRelationship(companionId);
  const activityState = useActivity(activityId);
  const activityActions = useActivities();
  const { activity, refresh: refreshActivity, setActivity } = activityState;
  const [companion, setCompanion] = useState<CompanionDetail | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState<ChatEmotion>('neutral');
  const [draft, setDraft] = useState('');
  const [quotaModalVisible, setQuotaModalVisible] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastSignals, setLastSignals] = useState<Partial<RelationshipDimensions> | null>(null);
  const [signalToken, setSignalToken] = useState(0);
  const [lastUnlocks, setLastUnlocks] = useState<ChatUnlock[] | null>(null);
  const [unlockToken, setUnlockToken] = useState(0);

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  useEffect(() => {
    let cancelled = false;
    getCompanion(companionId)
      .then((detail) => {
        if (!cancelled) setCompanion(detail);
      })
      .catch(() => {
        if (!cancelled) setCompanion(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companionId]);

  useEffect(() => {
    for (let i = history.messages.length - 1; i >= 0; i--) {
      const msg = history.messages[i];
      if ((msg.role === 'companion' || msg.role === 'assistant') && typeof msg.emotion === 'string') {
        if ((CHAT_EMOTIONS as readonly string[]).includes(msg.emotion)) setCurrentEmotion(msg.emotion as ChatEmotion);
        return;
      }
    }
  }, [history.messages]);

  useEffect(() => {
    if (!rateLimitedUntil) return;
    const id = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(id);
  }, [rateLimitedUntil]);

  useEffect(() => {
    if (rateLimitedUntil && now >= rateLimitedUntil) setRateLimitedUntil(null);
  }, [now, rateLimitedUntil]);

  const items = useMemo<ChatListItem[]>(() => {
    if (!stream.isStreaming) return history.messages;
    return [...history.messages, { __streaming: true, id: STREAMING_ID, text: stream.streamingText }];
  }, [history.messages, stream.isStreaming, stream.streamingText]);

  const remainingSeconds = useMemo(() => {
    if (!rateLimitedUntil) return 0;
    return Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
  }, [now, rateLimitedUntil]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || stream.isStreaming || remainingSeconds > 0) return;

    history.appendMessage({
      companion_id: companionId,
      content: text,
      created_at: new Date().toISOString(),
      id: `local-user-${Date.now()}`,
      role: 'user',
    });
    setDraft('');

    let serverMessageId = '';
    try {
      const result = await stream.send(text, {
        activityId,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onEmotion: (emotion) => setCurrentEmotion(emotion),
        onSignals: (signals) => {
          setLastSignals(signals);
          setSignalToken((token) => token + 1);
        },
        onUnlocks: (unlocks) => {
          setLastUnlocks(unlocks);
          setUnlockToken((token) => token + 1);
        },
        sceneId,
      });
      history.appendMessage({
        companion_id: companionId,
        content: result.text,
        created_at: new Date().toISOString(),
        emotion: result.emotion,
        id: serverMessageId || `local-companion-${Date.now()}`,
        role: 'companion',
        scene_id: sceneId ?? null,
      });
      // Pull server truth so the HUD progress bar reflects this turn.
      void relationship.refresh();
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        setQuotaModalVisible(true);
      } else if (error instanceof RateLimitedError) {
        const seconds = error.retryAfter ?? 60;
        setRateLimitedUntil(Date.now() + seconds * 1000);
        pushError(`Please wait ${seconds} seconds before sending again.`);
      } else if (error instanceof ApiError && error.status === 401) {
        pushError('Your session has expired. Please sign in again.');
      } else {
        pushError(error instanceof Error ? error.message : 'Failed to send message.');
      }
    }
  }, [activityId, companionId, draft, history, pushError, relationship, remainingSeconds, sceneId, stream]);

  const handleCompleteActivity = useCallback(async () => {
    if (!activityId) return;
    try {
      const payload = await activityActions.complete(activityId);
      setActivity(payload.activity);
    } catch (error) {
      pushError(error instanceof Error ? error.message : 'Activity could not be completed.');
    }
  }, [activityActions, activityId, pushError, setActivity]);

  const handleCancelActivity = useCallback(async () => {
    if (!activityId) return;
    try {
      const payload = await activityActions.cancel(activityId);
      setActivity(payload.activity);
    } catch (error) {
      pushError(error instanceof Error ? error.message : 'Activity could not be cancelled.');
    }
  }, [activityActions, activityId, pushError, setActivity]);

  const shownEmotion = gateEmotion(currentEmotion, companion?.art_emotions);
  const handleEmotionArtReady = useCallback((emotion: NonNeutralChatEmotionKey, key: string) => {
    setCompanion((current) =>
      current
        ? {
            ...current,
            art_emotions: { ...(current.art_emotions ?? {}), [emotion]: key },
          }
        : current,
    );
  }, []);

  useOnDemandEmotionArt({
    artEmotions: companion?.art_emotions,
    artUrl: companion?.art_url,
    companionId,
    emotion: shownEmotion,
    onReady: handleEmotionArtReady,
    source: companion?.source,
  });

  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      const native = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
      if (native.key === 'Enter' && !native.shiftKey) {
        event.preventDefault?.();
        void handleSend();
      }
    },
    [handleSend],
  );

  if (history.isLoadingInitial) {
    return <LoadingScreen label="Loading chat..." />;
  }

  if (history.error) {
    return (
      <WebAppShell title={companion?.name ?? 'Chat'} subtitle="Conversation could not be loaded.">
        <EmptyState actionLabel="Try again" description="Conversation history could not be loaded." onAction={history.refresh} title="Chat unavailable" />
      </WebAppShell>
    );
  }

  const portrait = mediaSource(companion?.art_emotions?.[shownEmotion as ChatEmotionKey] ?? companion?.art_url ?? null);

  return (
    <WebAppShell title={companion?.name ?? 'Chat'} subtitle="Streaming conversation workspace.">
      <View className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <WebPanel className="xl:col-span-1">
          <View className="aspect-[4/5] items-center justify-end overflow-hidden rounded-lg border border-app-line bg-app-primarySoft">
            <View pointerEvents="none" style={chatPortraitStyles.portraitFloor} />
            {portrait ? <Image source={portrait} resizeMode="contain" style={chatPortraitStyles.portraitImage} /> : null}
          </View>
          <Text className="mt-4 text-xl font-semibold text-app-text">{companion?.name ?? 'Companion'}</Text>
          <Text className="mt-1 text-sm uppercase tracking-normal text-app-muted">{companion?.relationship_role ?? 'companion'}</Text>
          <View className="mt-4 rounded-full bg-app-primarySoft px-3 py-2">
            <Text className="text-sm font-semibold text-app-primary">{shownEmotion}</Text>
          </View>
          <View className="mt-4 overflow-hidden rounded-lg border border-app-line">
            <ChatRelationshipHud goal={relationship.goal} />
          </View>
          <View className="mt-5">
            <Button label="View profile" onPress={() => router.push(`/companion/${encodeURIComponent(companionId)}`)} variant="secondary" />
          </View>
        </WebPanel>

        <View className="overflow-hidden rounded-lg border border-app-line bg-white xl:col-span-3">
          <ActivityContextBanner
            activity={activity}
            isMutating={activityActions.isMutating}
            onCancel={handleCancelActivity}
            onComplete={handleCompleteActivity}
          />
          <SignalFeedback signals={lastSignals} token={signalToken} />
          <UnlockCelebration unlocks={lastUnlocks} token={unlockToken} />
          <View className="h-[620px] justify-end bg-app-bg">
            <View className="gap-2 px-2 py-4">
              {history.hasMore ? (
                <View className="items-center">
                  <Pressable accessibilityRole="button" onPress={() => void history.loadMore()} className="rounded-full border border-app-line bg-white px-4 py-2">
                    <Text className="text-sm font-semibold text-app-primary">{history.isLoadingMore ? 'Loading...' : 'Load earlier messages'}</Text>
                  </Pressable>
                </View>
              ) : null}
              {items.map((item) => {
                if (isStreamingItem(item)) {
                  return <StreamingBubble key={item.id} text={item.text} />;
                }
                const role = item.role === 'assistant' ? 'companion' : item.role;
                const showCapture =
                  role === 'companion' && typeof item.scene_id === 'string' && item.scene_id.length > 0;
                return (
                  <View key={item.id}>
                    <MessageBubble content={item.content} role={role} />
                    {showCapture ? (
                      <MomentImageCapture messageId={item.id} initialMoment={item.moment_image ?? null} />
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
          {remainingSeconds > 0 ? (
            <View className="border-t border-app-line bg-app-warning/10 px-4 py-2">
              <Text className="text-center text-sm font-medium text-app-warning">{`Slow down - try again in ${remainingSeconds}s`}</Text>
            </View>
          ) : null}
          <View className="border-t border-app-line bg-white p-4">
            <View className="flex-row items-end gap-3">
              <TextInput
                editable={!stream.isStreaming}
                multiline
                onChangeText={setDraft}
                onKeyPress={handleKeyPress}
                placeholder="Write a message..."
                placeholderTextColor="#8B949E"
                value={draft}
                className="max-h-32 min-h-12 flex-1 rounded-lg border border-app-line bg-app-bg px-4 py-3 text-base text-app-text"
              />
              <Pressable
                accessibilityRole="button"
                disabled={stream.isStreaming || remainingSeconds > 0 || draft.trim().length === 0}
                onPress={() => void handleSend()}
                className={`h-12 w-12 items-center justify-center rounded-lg ${
                  stream.isStreaming || remainingSeconds > 0 || draft.trim().length === 0 ? 'bg-app-line' : 'bg-app-primary'
                }`}
              >
                <Ionicons color="#FFFFFF" name="send" size={18} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <Modal animationType="fade" transparent visible={quotaModalVisible} onRequestClose={() => setQuotaModalVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full max-w-sm rounded-lg bg-white p-6">
            <Text className="text-xl font-semibold text-app-text">Daily limit reached</Text>
            <Text className="mt-3 text-sm leading-5 text-app-muted">Upgrade to Pro to keep conversations going today.</Text>
            <View className="mt-5 gap-2">
              <Button label="Upgrade to Pro" onPress={() => router.push('/billing')} />
              <Button label="Not now" onPress={() => setQuotaModalVisible(false)} variant="secondary" />
            </View>
          </View>
        </View>
      </Modal>
    </WebAppShell>
  );
}

const chatPortraitStyles = StyleSheet.create({
  portraitFloor: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    bottom: 0,
    height: 58,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  portraitImage: {
    height: '112%',
    transform: [{ translateY: 9 }],
    width: '112%',
  },
});
