import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type ViewStyle,
} from 'react-native';

import { getCompanion, mediaSource } from '@/api/companion-client';
import type {
  ChatMessage,
  ChatMomentImage,
  ChatUnlock,
  CompanionDetail,
  RelationshipDimensions,
} from '@/api/types';
import { ActivityContextBanner } from '@/components/ActivityContextBanner';
import { ChatRelationshipHud } from '@/components/ChatRelationshipHud';
import { CompanionStoryPanel } from '@/components/CompanionStoryPanel';
import { MessageBubble } from '@/components/MessageBubble';
import { MomentImageCapture } from '@/components/MomentImageCapture';
import { SignalFeedback } from '@/components/SignalFeedback';
import { StreamingBubble } from '@/components/StreamingBubble';
import { UnlockCelebration } from '@/components/UnlockCelebration';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebCard, WebDialog, WebEmptyState, WebLoading, WebTag } from '@/components/web/ui';
import { ApiError, QuotaExceededError, RateLimitedError } from '@/hooks/use-api';
import { useActivities, useActivity } from '@/hooks/use-activities';
import { useAutoVoice } from '@/hooks/use-auto-voice';
import { useChatHistory } from '@/hooks/use-chat-history';
import { useChatRelationship } from '@/hooks/use-chat-relationship';
import { CHAT_EMOTIONS, useChatStream, type ChatEmotion } from '@/hooks/use-chat-stream';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { usePersonas } from '@/hooks/use-personas';
import { PersonaSelector } from '@/components/PersonaSelector';
import { useMessageActions } from '@/hooks/use-message-actions';
import { MessageActions } from '@/components/MessageActions';
import { useEditMessage } from '@/hooks/use-edit-message';
import { UserMessageEditor } from '@/components/UserMessageEditor';

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
  const personasState = usePersonas();
  const personas = personasState.data?.personas ?? [];
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const activePersonaId =
    selectedPersonaId ?? personas.find((p) => p.is_default)?.id ?? personas[0]?.id ?? null;
  const messageActions = useMessageActions(companionId, history, pushError);
  const autoVoice = useAutoVoice();
  const editMessage = useEditMessage(companionId, history, {
    onError: pushError,
    onSaved: () => {
      shouldAutoScrollRef.current = true;
      void relationship.refresh();
    },
  });
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
  const threadScrollRef = useRef<ScrollView>(null);
  const shouldAutoScrollRef = useRef(true);
  const didInitialScrollRef = useRef(false);

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

  const scrollThreadToEnd = useCallback((animated = false) => {
    globalThis.setTimeout(() => {
      threadScrollRef.current?.scrollToEnd({ animated });
    }, 0);
  }, []);

  const handleThreadContentSizeChange = useCallback(() => {
    if (shouldAutoScrollRef.current) {
      scrollThreadToEnd(false);
    }
  }, [scrollThreadToEnd]);

  const handleLoadMore = useCallback(async () => {
    shouldAutoScrollRef.current = false;
    await history.loadMore();
  }, [history]);

  useEffect(() => {
    didInitialScrollRef.current = false;
    shouldAutoScrollRef.current = true;
  }, [companionId]);

  useEffect(() => {
    if (history.isLoadingInitial || didInitialScrollRef.current) {
      return;
    }
    didInitialScrollRef.current = true;
    shouldAutoScrollRef.current = true;
    scrollThreadToEnd(false);
  }, [history.isLoadingInitial, scrollThreadToEnd]);

  useEffect(() => {
    if (!stream.isStreaming) {
      return;
    }
    shouldAutoScrollRef.current = true;
    scrollThreadToEnd(false);
  }, [scrollThreadToEnd, stream.isStreaming, stream.streamingText]);

  const items = useMemo<ChatListItem[]>(() => {
    if (!stream.isStreaming) return history.messages;
    return [...history.messages, { __streaming: true, id: STREAMING_ID, text: stream.streamingText }];
  }, [history.messages, stream.isStreaming, stream.streamingText]);

  const updateHistoryMessage = history.updateMessage;
  const handleMomentReady = useCallback((messageId: string, moment: ChatMomentImage) => {
    updateHistoryMessage(messageId, (message) => ({ ...message, moment_image: moment }));
    shouldAutoScrollRef.current = true;
    scrollThreadToEnd(false);
  }, [scrollThreadToEnd, updateHistoryMessage]);
  const remainingSeconds = useMemo(() => {
    if (!rateLimitedUntil) return 0;
    return Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
  }, [now, rateLimitedUntil]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || stream.isStreaming || remainingSeconds > 0) return;

    shouldAutoScrollRef.current = true;
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
        personaId: activePersonaId ?? undefined,
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
      shouldAutoScrollRef.current = true;
      await history.refresh({ silent: true });
      scrollThreadToEnd(false);
      // Auto-play the new reply when the global voice toggle is on.
      if (autoVoice.enabled && serverMessageId) {
        void messageActions.speak(serverMessageId);
      }
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
  }, [activePersonaId, activityId, autoVoice.enabled, companionId, draft, history, messageActions, pushError, relationship, remainingSeconds, sceneId, scrollThreadToEnd, stream]);

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

  const shownEmotion = currentEmotion;

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
    return <WebLoading label="Loading chat..." />;
  }

  if (history.error) {
    return (
      <WebAppShell title={companion?.name ?? 'Chat'} subtitle="Conversation could not be loaded.">
        <WebEmptyState
          actionLabel="Try again"
          description="Conversation history could not be loaded."
          onAction={history.refresh}
          title="Chat unavailable"
        />
      </WebAppShell>
    );
  }

  const portrait = mediaSource(companion?.art_url ?? null);
  const canSend = !stream.isStreaming && remainingSeconds === 0 && draft.trim().length > 0;

  return (
    <WebAppShell title={companion?.name ?? 'Chat'} subtitle="Streaming conversation workspace.">
      <View className="grid grid-cols-1 gap-6 xl:grid-cols-[320px_1fr]">
        {/* Companion info card */}
        <View className="gap-5">
          <WebCard padding="md" className="gap-4">
            <View className="items-center gap-3">
              <View className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-app-rose-soft shadow-card">
                <View pointerEvents="none" style={chatPortraitStyles.portraitFloor} />
                {portrait ? (
                  <Image
                    accessibilityLabel={companion?.name ?? 'Companion portrait'}
                    resizeMode="contain"
                    source={portrait}
                    style={chatPortraitStyles.portraitImage}
                  />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <Ionicons color="#C9486B" name="person-outline" size={32} />
                  </View>
                )}
              </View>
              <View className="items-center gap-1">
                <Text className="font-serif text-title text-app-ink">{companion?.name ?? 'Companion'}</Text>
                <Text className="text-overline text-rose-deep">{companion?.relationship_role ?? 'companion'}</Text>
              </View>
              <WebTag size="sm" variant="rose">
                {shownEmotion}
              </WebTag>
            </View>

            <View className="overflow-hidden rounded-2xl border border-app-line-soft bg-app-sunken/40">
              <ChatRelationshipHud goal={relationship.goal} />
            </View>

            <View className="overflow-hidden rounded-2xl border border-app-line-soft bg-app-sunken/40">
              <PersonaSelector personas={personas} selectedId={activePersonaId} onSelect={setSelectedPersonaId} />
            </View>

            <CompanionStoryPanel
              companionId={companionId}
              compact
              onChanged={relationship.refresh}
              showEditor={false}
            />

            <WebButton
              label="View profile"
              onPress={() => router.push(`/companion/${encodeURIComponent(companionId)}`)}
              variant="outline"
              iconLeft={<Ionicons color="#2A1F1A" name="person-circle-outline" size={16} />}
            />
          </WebCard>
        </View>

        {/* Twilight conversation workspace */}
        <View className="rounded-2xl border border-app-line bg-app-twilight shadow-float">
          {/* Header strip — pinned to the top of the page scroll so the companion
              name / status / Live tag stay visible while the conversation scrolls. */}
          <View
            className="flex-row items-center justify-between rounded-t-2xl border-b border-white/5 bg-app-twilight-soft px-7 py-4"
            style={twilightStyles.stickyHeader}
          >
            <View className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-rose-soft">
                <Ionicons color="#9A2F4F" name="chatbubbles" size={16} />
              </View>
              <View>
                <Text className="font-serif text-title-sm text-white">{companion?.name ?? 'Companion'}</Text>
                <Text className="text-caption text-white/60">
                  {stream.isStreaming
                    ? 'Composing a reply...'
                    : remainingSeconds > 0
                      ? `Slow down — reply in ${remainingSeconds}s`
                      : 'Tap into the moment.'}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={autoVoice.enabled ? 'Turn off auto voice' : 'Turn on auto voice'}
                onPress={autoVoice.toggle}
                className={`h-9 w-9 items-center justify-center rounded-full ${
                  autoVoice.enabled ? 'bg-rose shadow-glow' : 'bg-white/10'
                }`}
              >
                <Ionicons
                  color={autoVoice.enabled ? '#FFFFFF' : 'rgba(255,255,255,0.6)'}
                  name={autoVoice.enabled ? 'volume-high' : 'volume-mute-outline'}
                  size={16}
                />
              </Pressable>
              <WebTag size="sm" variant="rose">
                Live
              </WebTag>
            </View>
          </View>

          {/* Everything below the pinned header keeps the card's rounded bottom. */}
          <View className="overflow-hidden rounded-b-2xl">
          <ActivityContextBanner
            activity={activity}
            isMutating={activityActions.isMutating}
            onCancel={handleCancelActivity}
            onComplete={handleCompleteActivity}
          />
          <SignalFeedback signals={lastSignals} token={signalToken} />
          <UnlockCelebration unlocks={lastUnlocks} token={unlockToken} />

          {/* Messages scroll area */}
          <ScrollView
            ref={threadScrollRef}
            contentContainerStyle={twilightStyles.threadContent}
            onContentSizeChange={handleThreadContentSizeChange}
            style={twilightStyles.thread}
          >
            {history.hasMore ? (
              <View className="items-center pb-4 pt-2">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handleLoadMore()}
                  className="rounded-full border border-app-rose/30 bg-app-rose-soft px-5 py-2"
                >
                  <Text className="text-caption font-semibold text-app-rose-deep">
                    {history.isLoadingMore ? 'Loading…' : 'Load earlier messages'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <View className="gap-3 px-3 pb-6">
              {items.map((item) => {
                if (isStreamingItem(item)) {
                  return <StreamingBubble key={item.id} text={item.text} />;
                }
                const role = item.role === 'assistant' ? 'companion' : item.role;
                const isServerCompanion = role === 'companion' && !item.id.startsWith('local-');
                const isServerUser = role === 'user' && !item.id.startsWith('local-');
                if (isServerUser && editMessage.editingId === item.id) {
                  return (
                    <UserMessageEditor
                      key={item.id}
                      text={editMessage.editingText}
                      isSaving={editMessage.isSaving}
                      onChangeText={editMessage.setEditingText}
                      onSave={editMessage.saveEdit}
                      onCancel={editMessage.cancelEdit}
                    />
                  );
                }
                return (
                  <View key={item.id}>
                    <MessageBubble content={item.content} role={role} />
                    {isServerUser ? (
                      <View className="w-full flex-row justify-end px-5 pb-1">
                        <Pressable
                          accessibilityRole="button"
                          disabled={editMessage.isSaving}
                          onPress={() => editMessage.beginEdit(item.id, item.content)}
                        >
                          <Text className="text-xs font-semibold text-app-muted">Edit</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {isServerCompanion ? (
                      <MessageActions
                        variants={item.variants}
                        selectedVariant={item.selected_variant}
                        isRegenerating={messageActions.regeneratingId === item.id}
                        isSpeaking={messageActions.speakingId === item.id}
                        disabled={messageActions.regeneratingId !== null && messageActions.regeneratingId !== item.id}
                        onRegenerate={() => messageActions.regenerate(item.id)}
                        onSelectVariant={(index) => messageActions.selectVariant(item.id, index)}
                        onSpeak={() => messageActions.speak(item.id)}
                      />
                    ) : null}
                    {isServerCompanion ? (
                      <MomentImageCapture
                        messageId={item.id}
                        initialMoment={item.moment_image ?? null}
                        onMomentReady={(moment) => handleMomentReady(item.id, moment)}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {/* Composer */}
          <View className="border-t border-white/5 bg-app-twilight-soft px-5 py-4">
            <View className="flex-row items-end gap-3">
              <View className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 focus-within:border-rose/60">
                <TextInput
                  multiline
                  onChangeText={setDraft}
                  onKeyPress={handleKeyPress}
                  placeholder="Write a message..."
                  placeholderTextColor="rgba(255,255,255,0.40)"
                  value={draft}
                  className="max-h-32 min-h-10 flex-1 py-1 text-body text-white"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={!canSend}
                onPress={() => void handleSend()}
                className={`h-12 w-12 items-center justify-center rounded-2xl ${
                  canSend ? 'bg-rose shadow-glow' : 'bg-white/10'
                }`}
              >
                <Ionicons color={canSend ? '#FFFFFF' : 'rgba(255,255,255,0.4)'} name="send" size={18} />
              </Pressable>
            </View>
            {remainingSeconds > 0 ? (
              <View className="mt-3 flex-row items-center gap-2 self-start rounded-full border border-ember/30 bg-ember/10 px-3 py-1">
                <Ionicons color="#D97757" name="hourglass-outline" size={12} />
                <Text className="text-caption font-semibold text-ember">{`Slow down — try again in ${remainingSeconds}s`}</Text>
              </View>
            ) : null}
          </View>
          </View>
        </View>
      </View>

      <WebDialog
        description="You've used today's free messages. Upgrade to Pro to keep the conversation going."
        footer={
          <View className="flex-row items-center justify-end gap-3">
            <WebButton label="Not now" onPress={() => setQuotaModalVisible(false)} variant="ghost" />
            <WebButton
              label="Upgrade to Pro"
              onPress={() => {
                setQuotaModalVisible(false);
                router.push('/billing');
              }}
              variant="primary"
            />
          </View>
        }
        onClose={() => setQuotaModalVisible(false)}
        open={quotaModalVisible}
        size="sm"
        title="Daily limit reached"
      />
    </WebAppShell>
  );
}

const chatPortraitStyles = StyleSheet.create({
  portraitFloor: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    bottom: 0,
    height: 56,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  portraitImage: {
    height: '112%',
    transform: [{ translateY: 10 }],
    width: '112%',
  },
});

const twilightStyles = StyleSheet.create({
  // `position: sticky` is a web-only value react-native-web understands but the
  // RN style types don't list — pin the header to the top of the page scroll.
  stickyHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
  } as unknown as ViewStyle,
  thread: {
    backgroundColor: '#0E0B14',
    flexGrow: 1,
    maxHeight: 620,
    minHeight: 420,
  },
  threadContent: {
    paddingTop: 8,
  },
});
