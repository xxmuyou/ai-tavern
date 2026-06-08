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

import { getCompanion, getInviteTargets, getScenes, mediaSource } from '@/api/companion-client';
import type {
  ChatInviteResult,
  ChatMessage,
  ChatMomentImage,
  ChatUnlock,
  CompanionDetail,
  InviteTarget,
  RelationshipDimensions,
  Scene,
} from '@/api/types';
import { ActivityContextBanner } from '@/components/ActivityContextBanner';
import { ChatRelationshipHud } from '@/components/ChatRelationshipHud';
import { CompanionStoryPanel } from '@/components/CompanionStoryPanel';
import { EventPopup } from '@/components/EventPopup';
import { InvitePopup } from '@/components/InvitePopup';
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
import { usePendingMomentImages } from '@/hooks/use-pending-moment-images';
import { usePendingEvents } from '@/hooks/use-pending-events';
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

function inviteTextForTarget(target: InviteTarget): string {
  return `Want to go to ${target.name} with me?`;
}

export default function WebChatScreen() {
  const params = useLocalSearchParams<{ activityId?: string; companionId?: string; sceneId?: string; sceneArt?: string }>();
  const companionId = typeof params.companionId === 'string' ? params.companionId : '';
  const activityId = typeof params.activityId === 'string' ? params.activityId : undefined;
  const initialSceneId = typeof params.sceneId === 'string' ? params.sceneId : undefined;
  const initialSceneArt =
    typeof params.sceneArt === 'string' && params.sceneArt.length > 0 ? params.sceneArt : null;
  // spec-036: scene is mutable mid-chat — an accepted invitation switches it.
  const [sceneId, setSceneId] = useState<string | undefined>(initialSceneId);
  const [sceneArt, setSceneArt] = useState<string | null>(initialSceneArt);
  const [sceneName, setSceneName] = useState<string | null>(null);
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
  const activeActivityId = activity?.status === 'active' ? activityId : undefined;
  const pendingEvents = usePendingEvents(null);
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
  // spec-036: in-chat invitation to go somewhere.
  const [invitePickerVisible, setInvitePickerVisible] = useState(false);
  const [inviteTargets, setInviteTargets] = useState<InviteTarget[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<InviteTarget | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const threadScrollRef = useRef<ScrollView>(null);
  const shouldAutoScrollRef = useRef(true);
  const didInitialScrollRef = useRef(false);

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  useEffect(() => {
    let cancelled = false;
    getScenes()
      .then((payload) => {
        if (!cancelled) setScenes(payload.scenes);
      })
      .catch(() => {
        if (!cancelled) setScenes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  usePendingMomentImages({ messages: history.messages, onUpdate: handleMomentReady });
  const remainingSeconds = useMemo(() => {
    if (!rateLimitedUntil) return 0;
    return Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
  }, [now, rateLimitedUntil]);

  const showInviteNotice = useCallback((message: string) => {
    setInviteNotice(message);
    globalThis.setTimeout(() => setInviteNotice(null), 3200);
  }, []);

  const handleInviteResult = useCallback(
    (invite: ChatInviteResult, target: InviteTarget | null) => {
      if (invite.accepted && invite.scene_id) {
        setSceneId(invite.scene_id);
        setSceneArt(invite.scene_art_url ?? null);
        setSceneName(target?.name ?? null);
        if (invite.activity_completed) {
          setActivity(null);
        }
        showInviteNotice(`You headed to ${target?.name ?? 'a new place'} together.`);
      } else {
        showInviteNotice(`${companion?.name ?? 'They'} didn't take you up on it.`);
      }
    },
    [companion?.name, setActivity, showInviteNotice],
  );

  const openInvitePicker = useCallback(async () => {
    setInvitePickerVisible(true);
    setInviteLoading(true);
    try {
      const res = await getInviteTargets(companionId, sceneId);
      setInviteTargets(res.targets);
    } catch {
      setInviteTargets([]);
    } finally {
      setInviteLoading(false);
    }
  }, [companionId, sceneId]);

  const sendInviteToTarget = useCallback(async (target: InviteTarget) => {
    if (stream.isStreaming || remainingSeconds > 0) return;
    const text = inviteTextForTarget(target);
    setPendingInvite(null);
    shouldAutoScrollRef.current = true;
    history.appendMessage({
      companion_id: companionId,
      content: text,
      created_at: new Date().toISOString(),
      id: `local-user-${Date.now()}`,
      role: 'user',
    });

    let serverMessageId = '';
    try {
      const result = await stream.send(text, {
        activityId: activeActivityId,
        inviteSceneId: target.id,
        personaId: activePersonaId ?? undefined,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onEmotion: (emotion) => setCurrentEmotion(emotion),
        onInviteResult: (invite) => {
          handleInviteResult(invite, target);
        },
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
      if (autoVoice.enabled && serverMessageId) {
        void messageActions.speak(serverMessageId);
      }
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
        pushError(error instanceof Error ? error.message : 'Failed to send invitation.');
      }
    }
  }, [activeActivityId, activePersonaId, autoVoice.enabled, companionId, handleInviteResult, history, messageActions, pushError, relationship, remainingSeconds, sceneId, scrollThreadToEnd, stream]);

  const handleInviteSelect = useCallback((target: InviteTarget) => {
    setInvitePickerVisible(false);
    void sendInviteToTarget(target);
  }, [sendInviteToTarget]);

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
      const invitedTarget = pendingInvite;
      const result = await stream.send(text, {
        activityId: activeActivityId,
        inviteSceneId: invitedTarget?.id,
        personaId: activePersonaId ?? undefined,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onEmotion: (emotion) => setCurrentEmotion(emotion),
        onInviteResult: (invite) => {
          handleInviteResult(invite, invitedTarget);
        },
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
      // The invitation only applies to this turn; clear it once sent.
      setPendingInvite(null);
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
  }, [activeActivityId, activePersonaId, autoVoice.enabled, companionId, draft, handleInviteResult, history, messageActions, pendingInvite, pushError, relationship, remainingSeconds, sceneId, scrollThreadToEnd, stream]);

  const sendQuickAction = useCallback(async (itemId: 'coffee' | 'flowers') => {
    if (stream.isStreaming || remainingSeconds > 0) return;
    const text = itemId === 'coffee' ? 'I ordered coffee for us.' : 'I sent you flowers.';
    shouldAutoScrollRef.current = true;
    history.appendMessage({
      companion_id: companionId,
      content: text,
      created_at: new Date().toISOString(),
      id: `local-user-${Date.now()}`,
      role: 'user',
    });

    let serverMessageId = '';
    try {
      const result = await stream.send(text, {
        activityId: activeActivityId,
        personaId: activePersonaId ?? undefined,
        quickAction: { item_id: itemId, type: 'gift' },
        sceneId,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onEmotion: (emotion) => setCurrentEmotion(emotion),
        onQuickActionResult: (quick) => {
          showInviteNotice(quick.ok
            ? (quick.item_id === 'coffee' ? 'Coffee is part of this moment now.' : 'Flowers are part of this moment now.')
            : 'That gesture could not be recorded.');
        },
        onSignals: (signals) => {
          setLastSignals(signals);
          setSignalToken((token) => token + 1);
        },
        onUnlocks: (unlocks) => {
          setLastUnlocks(unlocks);
          setUnlockToken((token) => token + 1);
        },
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
      if (autoVoice.enabled && serverMessageId) {
        void messageActions.speak(serverMessageId);
      }
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
        pushError(error instanceof Error ? error.message : 'Quick action failed.');
      }
    }
  }, [activeActivityId, activePersonaId, autoVoice.enabled, companionId, history, messageActions, pushError, relationship, remainingSeconds, sceneId, scrollThreadToEnd, showInviteNotice, stream]);

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
  const currentScene = scenes.find((scene) => scene.id === sceneId) ?? null;
  const currentSceneText = [
    currentScene?.id ?? sceneId ?? '',
    currentScene?.name ?? '',
    currentScene?.mood ?? '',
    ...(currentScene?.tags ?? []),
  ].join(' ').toLowerCase();
  const canOrderCoffee = Boolean(sceneId) && (currentSceneText.includes('coffee') || currentSceneText.includes('cafe'));
  const canUseQuickAction = Boolean(sceneId) && !stream.isStreaming && remainingSeconds === 0;
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
          {sceneArt ? (
            <View className="relative h-28 w-full overflow-hidden border-b border-white/5">
              <Image
                accessibilityLabel={sceneName ? `Scene: ${sceneName}` : 'Current scene'}
                resizeMode="cover"
                source={mediaSource(sceneArt) ?? undefined}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={twilightStyles.sceneScrim} />
              {sceneName ? (
                <View className="absolute bottom-2 left-4 flex-row items-center gap-1.5 rounded-full bg-black/45 px-3 py-1">
                  <Ionicons color="#FFFFFF" name="location" size={12} />
                  <Text className="text-caption font-semibold text-white">{sceneName}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {inviteNotice ? (
            <View className="border-b border-white/5 bg-rose/15 px-5 py-2">
              <Text className="text-center text-caption font-semibold text-rose-soft">{inviteNotice}</Text>
            </View>
          ) : null}
          <ActivityContextBanner
            activity={activity}
            isMutating={activityActions.isMutating}
            onCancel={handleCancelActivity}
            onComplete={handleCompleteActivity}
          />
          <SignalFeedback signals={lastSignals} token={signalToken} />
          <UnlockCelebration
            unlocks={lastUnlocks}
            token={unlockToken}
            onInviteScene={(unlock) => {
              if (!unlock.scene_id) return;
              setPendingInvite({
                art_url: null,
                id: unlock.scene_id,
                mood: '',
                name: unlock.scene_name ?? 'the new place',
              });
            }}
            onViewScene={(unlock) => {
              if (unlock.scene_id) router.push(`/scene/${encodeURIComponent(unlock.scene_id)}`);
            }}
          />

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
            {pendingInvite ? (
              <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-rose/30 bg-rose/10 px-3 py-2">
                <View className="flex-1 flex-row items-center gap-2">
                  <Ionicons color="#F6C6D6" name="navigate" size={14} />
                  <Text numberOfLines={1} className="flex-1 text-caption font-semibold text-rose-soft">
                    {`Inviting to ${pendingInvite.name} — send your message`}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel invitation"
                  onPress={() => setPendingInvite(null)}
                  className="ml-2 h-6 w-6 items-center justify-center rounded-full bg-white/10"
                >
                  <Ionicons color="rgba(255,255,255,0.7)" name="close" size={13} />
                </Pressable>
              </View>
            ) : null}
            <View className="mb-3 flex-row flex-wrap gap-2">
              {canOrderCoffee ? (
                <QuickActionButton
                  disabled={!canUseQuickAction}
                  icon="cafe-outline"
                  label="Order coffee"
                  onPress={() => void sendQuickAction('coffee')}
                />
              ) : null}
              {sceneId ? (
                <QuickActionButton
                  disabled={!canUseQuickAction}
                  icon="flower-outline"
                  label="Send flowers"
                  onPress={() => void sendQuickAction('flowers')}
                />
              ) : null}
              <QuickActionButton
                disabled={stream.isStreaming}
                icon="navigate-outline"
                label="Invite somewhere"
                onPress={() => void openInvitePicker()}
                selected={Boolean(pendingInvite)}
              />
            </View>
            <View className="flex-row items-end gap-3">
              <View className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 focus-within:border-rose/60">
                <TextInput
                  multiline
                  onChangeText={setDraft}
                  onKeyPress={handleKeyPress}
                  placeholder={pendingInvite ? `Invite ${companion?.name ?? 'them'} to ${pendingInvite.name}...` : 'Write a message...'}
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

      <InvitePopup
        visible={invitePickerVisible}
        loading={inviteLoading}
        targets={inviteTargets}
        companionName={companion?.name ?? 'them'}
        onSelect={handleInviteSelect}
        onClose={() => setInvitePickerVisible(false)}
      />

      <EventPopup
        event={pendingEvents.current}
        isResolving={pendingEvents.isResolving}
        result={pendingEvents.result}
        visible={pendingEvents.visible}
        onClose={pendingEvents.close}
        onResolve={(event, optionId) => {
          void pendingEvents.resolve(event, optionId)
            .then((result) => {
              if (result.unlocks.length > 0) {
                setLastUnlocks(result.unlocks);
                setUnlockToken((token) => token + 1);
              }
              void relationship.refresh();
            })
            .catch((err) => pushError(err instanceof Error ? err.message : 'Event could not be resolved.'));
        }}
      />

      <WebDialog
        description="You don't have enough credits. Top up or upgrade to Pro to keep chatting."
        footer={
          <View className="flex-row items-center justify-end gap-3">
            <WebButton label="Not now" onPress={() => setQuotaModalVisible(false)} variant="ghost" />
            <WebButton
              label="Get credits"
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
        title="Out of credits"
      />
    </WebAppShell>
  );
}

function QuickActionButton({
  disabled,
  icon,
  label,
  onPress,
  selected,
}: {
  disabled?: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`min-h-9 flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${
        selected ? 'border-rose/50 bg-rose/20' : 'border-white/10 bg-white/5'
      } ${disabled ? 'opacity-50' : 'opacity-100'}`}
    >
      <Ionicons color="#F6C6D6" name={icon} size={15} />
      <Text className="text-caption font-semibold text-white">{label}</Text>
    </Pressable>
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
  sceneScrim: {
    backgroundColor: 'rgba(14,11,20,0.35)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
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
