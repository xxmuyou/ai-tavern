import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { clearChatHistory, getChatVoiceSettings, getCompanion, getInviteTargets, getScenes, getStoryMoment, resolveStoryChoice, updateChatVoiceSettings } from '@/api/companion-client';
import type {
  ChatEmotionKey,
  ChatInviteResult,
  ChatMessage,
  ChatMomentImage,
  ChatVoiceSettingsResponse,
  ChatUnlock,
  InviteTarget,
  RelationshipDimensions,
  Scene,
  StoryChoice,
  StoryMoment,
} from '@/api/types';
import { ActivityContextBanner } from '@/components/ActivityContextBanner';
import { AuthGuard } from '@/components/AuthGuard';
import { Button } from '@/components/Button';
import { ChatRelationshipHud } from '@/components/ChatRelationshipHud';
import { CompanionStoryPanel } from '@/components/CompanionStoryPanel';
import { EmptyState } from '@/components/EmptyState';
import { EventPopup } from '@/components/EventPopup';
import { InvitePopup } from '@/components/InvitePopup';
import { LoadingScreen } from '@/components/LoadingScreen';
import { MessageBubble } from '@/components/MessageBubble';
import { MomentImageCapture } from '@/components/MomentImageCapture';
import { PortraitBar } from '@/components/PortraitBar';
import { SignalFeedback } from '@/components/SignalFeedback';
import { StoryActionBar } from '@/components/StoryActionBar';
import { TopBar } from '@/components/TopBar';
import { UnlockCelebration } from '@/components/UnlockCelebration';
import { ApiError, QuotaExceededError, RateLimitedError } from '@/hooks/use-api';
import { useActivities, useActivity } from '@/hooks/use-activities';
import { useAutoVoice } from '@/hooks/use-auto-voice';
import { useChatAutoScroll } from '@/hooks/use-chat-auto-scroll';
import { useChatHistory } from '@/hooks/use-chat-history';
import { useChatRelationship } from '@/hooks/use-chat-relationship';
import { CHAT_EMOTIONS, useChatStream, type ChatEmotion } from '@/hooks/use-chat-stream';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { usePersonas } from '@/hooks/use-personas';
import { usePendingMomentImages } from '@/hooks/use-pending-moment-images';
import { usePendingEvents } from '@/hooks/use-pending-events';
import { PersonaSelector } from '@/components/PersonaSelector';
import { useStreamingChatMessages } from '@/hooks/use-streaming-chat-messages';
import { useMessageActions } from '@/hooks/use-message-actions';
import { MessageActions } from '@/components/MessageActions';
import { useEditMessage } from '@/hooks/use-edit-message';
import { UserMessageEditor } from '@/components/UserMessageEditor';
import { VoiceSettingsPanel } from '@/components/VoiceSettingsPanel';
import { inviteTextForTarget, quickActionTextForItem, sceneTransitionText, type QuickGiftItemId } from '@/utils/chat-actions';

const BILLING_ROUTE = '/billing' as Href;

type CompanionPortraitState = {
  art_emotions: Partial<Record<ChatEmotionKey, string>> | null;
  art_url: string | null;
  gender: 'female' | 'male' | null;
  name: string;
};

export default function ChatScreen() {
  return (
    <AuthGuard>
      <ChatScreenInner />
    </AuthGuard>
  );
}

function ChatScreenInner() {
  const params = useLocalSearchParams<{ activityId?: string; companionId?: string; sceneArt?: string; sceneId?: string }>();
  const companionId = typeof params.companionId === 'string' ? params.companionId : '';
  const activityId = typeof params.activityId === 'string' ? params.activityId : undefined;
  const initialSceneId = typeof params.sceneId === 'string' ? params.sceneId : undefined;
  const initialSceneArt =
    typeof params.sceneArt === 'string' && params.sceneArt.length > 0 ? params.sceneArt : null;
  // spec-036: scene is mutable mid-chat — an accepted invitation switches it.
  const [sceneId, setSceneId] = useState<string | undefined>(initialSceneId);
  const [sceneArt, setSceneArt] = useState<string | null>(initialSceneArt);
  const router = useRouter();
  const { pushError } = useErrorBanner();

  const [companion, setCompanion] = useState<CompanionPortraitState>({
    art_emotions: null,
    art_url: null,
    gender: null,
    name: 'Chat',
  });
  const [currentEmotion, setCurrentEmotion] = useState<ChatEmotion>('neutral');
  const [draft, setDraft] = useState('');
  const [quotaModalVisible, setQuotaModalVisible] = useState(false);
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
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
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [storyMoment, setStoryMoment] = useState<StoryMoment | null>(null);
  const [isResolvingStory, setIsResolvingStory] = useState(false);
  const [voiceSettingsVisible, setVoiceSettingsVisible] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<ChatVoiceSettingsResponse | null>(null);
  const [isSavingVoiceSettings, setIsSavingVoiceSettings] = useState(false);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  const history = useChatHistory(companionId);
  const streamingMessages = useStreamingChatMessages(companionId, history);
  const stream = useChatStream(companionId);
  // Streaming replies are real local messages now, so the same bubble grows in place.
  const items = history.messages;
  const autoScroll = useChatAutoScroll({
    getItems: () => items,
    listRef,
  });
  const {
    detachFromBottom,
    handleContentSizeChange,
    handleScroll,
    jumpToBottom,
    jumpToMessage,
    notifyMomentReady,
    notifyNewReply,
    pendingNotice,
    resetForThread,
  } = autoScroll;
  const relationship = useChatRelationship(companionId);
  const personasState = usePersonas();
  const personas = personasState.data?.personas ?? [];
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const activePersonaId =
    selectedPersonaId ?? personas.find((p) => p.is_default)?.id ?? personas[0]?.id ?? null;
  const messageActions = useMessageActions(companionId, history, pushError, () => setQuotaModalVisible(true));
  const autoVoice = useAutoVoice();
  const {
    appendLocalUserMessage,
    appendStreamingCompanionMessage,
    cleanupFailedStreamingCompanionMessage,
    finishStreamingCompanionMessage,
    updateStreamingCompanionMessage,
  } = streamingMessages;
  const editMessage = useEditMessage(companionId, history, {
    onError: pushError,
    onSaved: () => {
      notifyNewReply();
      void relationship.refresh();
    },
  });
  const activityState = useActivity(activityId);
  const activityActions = useActivities();
  const { activity, refresh: refreshActivity, setActivity } = activityState;
  const activeActivityId = activity?.status === 'active' ? activityId : undefined;
  const pendingEvents = usePendingEvents(null);

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

  useEffect(() => {
    resetForThread();
  }, [companionId, resetForThread]);

  useEffect(() => {
    let cancelled = false;
    if (!sceneId) {
      setStoryMoment(null);
      return;
    }
    getStoryMoment(companionId, sceneId)
      .then((payload) => {
        if (!cancelled) setStoryMoment(payload.story_moment);
      })
      .catch(() => {
        if (!cancelled) setStoryMoment(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companionId, sceneId]);

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
    if (history.isLoadingInitial) {
      return;
    }
    for (let i = history.messages.length - 1; i >= 0; i--) {
      const msg = history.messages[i];
      if ((msg.role === 'companion' || msg.role === 'assistant') && typeof msg.emotion === 'string') {
        if ((CHAT_EMOTIONS as readonly string[]).includes(msg.emotion)) {
          setCurrentEmotion(msg.emotion as ChatEmotion);
        }
        return;
      }
    }
  }, [history.isLoadingInitial, history.messages]);

  useEffect(() => {
    if (!companionId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const detail = await getCompanion(companionId);
        if (!cancelled) {
          setCompanion({
            art_emotions: detail.art_emotions ?? null,
            art_url: detail.art_url ?? null,
            gender: detail.gender ?? null,
            name: detail.name ?? 'Chat',
          });
        }
      } catch {
        if (!cancelled) {
          setCompanion({ art_emotions: null, art_url: null, gender: null, name: 'Chat' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companionId]);

  useEffect(() => {
    if (!companionId) return;
    let cancelled = false;
    getChatVoiceSettings(companionId)
      .then((settings) => {
        if (!cancelled) setVoiceSettings(settings);
      })
      .catch(() => {
        if (!cancelled) setVoiceSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companionId]);

  const saveVoiceSettings = useCallback(async (value: { voice_id: string; voice_speed: ChatVoiceSettingsResponse['voice_speed'] }) => {
    setIsSavingVoiceSettings(true);
    try {
      const next = await updateChatVoiceSettings(companionId, value);
      setVoiceSettings(next);
      setVoiceSettingsVisible(false);
    } finally {
      setIsSavingVoiceSettings(false);
    }
  }, [companionId]);

  useEffect(() => {
    if (!rateLimitedUntil) {
      return;
    }
    const tick = () => setNow(Date.now());
    const id = globalThis.setInterval(tick, 1000);
    return () => globalThis.clearInterval(id);
  }, [rateLimitedUntil]);

  useEffect(() => {
    if (rateLimitedUntil && now >= rateLimitedUntil) {
      setRateLimitedUntil(null);
    }
  }, [now, rateLimitedUntil]);

  const handleLoadMore = useCallback(() => {
    detachFromBottom();
    void history.loadMore();
  }, [detachFromBottom, history]);

  const showInviteNotice = useCallback((message: string) => {
    setInviteNotice(message);
    globalThis.setTimeout(() => setInviteNotice(null), 3200);
  }, []);

  const handleInviteResult = useCallback(
    (invite: ChatInviteResult, target: InviteTarget | null) => {
      if (invite.accepted && invite.scene_id) {
        setSceneId(invite.scene_id);
        setSceneArt(invite.scene_art_url ?? null);
        if (invite.activity_completed) {
          setActivity(null);
        }
        showInviteNotice(`You headed to ${target?.name ?? 'a new place'} together.`);
      } else {
        showInviteNotice(`${companion.name} didn't take you up on it.`);
      }
    },
    [companion.name, setActivity, showInviteNotice],
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
    if (stream.isStreaming) {
      return;
    }
    if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
      return;
    }
    const text = inviteTextForTarget(target);
    const messageSceneId = sceneId ?? null;
    appendLocalUserMessage(text, messageSceneId);
    const streamingMessageId = appendStreamingCompanionMessage(messageSceneId);

    let serverMessageId = '';
    let acceptedSceneId: string | null = null;
    let streamedText = '';
    try {
      const result = await stream.send(text, {
        activityId: activeActivityId,
        inviteSceneId: target.id,
        personaId: activePersonaId ?? undefined,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onChunk: (_delta, total) => {
          streamedText = total;
          updateStreamingCompanionMessage(streamingMessageId, total);
        },
        onEmotion: (emotion) => {
          setCurrentEmotion(emotion);
        },
        onInviteResult: (invite) => {
          acceptedSceneId = invite.accepted ? invite.scene_id : null;
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
      finishStreamingCompanionMessage(streamingMessageId, result, serverMessageId, messageSceneId);
      if (acceptedSceneId) {
        history.appendMessage({
          companion_id: companionId,
          content: sceneTransitionText(target.name),
          created_at: new Date().toISOString(),
          id: `local-scene-transition-${Date.now()}`,
          role: 'companion',
          scene_id: acceptedSceneId,
        });
      }
      notifyNewReply();
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
        const message = error instanceof Error ? error.message : 'Failed to send invitation.';
        pushError(message);
      }
      cleanupFailedStreamingCompanionMessage(streamingMessageId, streamedText);
    }
  }, [activeActivityId, activePersonaId, appendLocalUserMessage, appendStreamingCompanionMessage, autoVoice.enabled, cleanupFailedStreamingCompanionMessage, companionId, finishStreamingCompanionMessage, handleInviteResult, history, messageActions, notifyNewReply, pushError, rateLimitedUntil, relationship, sceneId, stream, updateStreamingCompanionMessage]);

  const handleInviteSelect = useCallback((target: InviteTarget) => {
    setInvitePickerVisible(false);
    void sendInviteToTarget(target);
  }, [sendInviteToTarget]);

  const remainingSeconds = useMemo(() => {
    if (!rateLimitedUntil) {
      return 0;
    }
    return Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
  }, [now, rateLimitedUntil]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || stream.isStreaming) {
      return;
    }
    if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
      return;
    }
    const messageSceneId = sceneId ?? null;
    appendLocalUserMessage(text, messageSceneId);
    const streamingMessageId = appendStreamingCompanionMessage(messageSceneId);
    setDraft('');

    let serverMessageId = '';
    let streamedText = '';
    try {
      const result = await stream.send(text, {
        activityId: activeActivityId,
        personaId: activePersonaId ?? undefined,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onChunk: (_delta, total) => {
          streamedText = total;
          updateStreamingCompanionMessage(streamingMessageId, total);
        },
        onEmotion: (emotion) => {
          setCurrentEmotion(emotion);
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
      finishStreamingCompanionMessage(streamingMessageId, result, serverMessageId, messageSceneId);
      notifyNewReply();
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
        const message = error instanceof Error ? error.message : 'Failed to send message.';
        pushError(message);
      }
      cleanupFailedStreamingCompanionMessage(streamingMessageId, streamedText);
    }
  }, [activeActivityId, activePersonaId, appendLocalUserMessage, appendStreamingCompanionMessage, autoVoice.enabled, cleanupFailedStreamingCompanionMessage, draft, finishStreamingCompanionMessage, messageActions, notifyNewReply, pushError, rateLimitedUntil, relationship, sceneId, stream, updateStreamingCompanionMessage]);

  const sendQuickAction = useCallback(async (itemId: QuickGiftItemId) => {
    if (stream.isStreaming || remainingSeconds > 0) return;
    const text = quickActionTextForItem(itemId);
    const messageSceneId = sceneId ?? null;
    appendLocalUserMessage(text, messageSceneId);
    const streamingMessageId = appendStreamingCompanionMessage(messageSceneId);

    let serverMessageId = '';
    let streamedText = '';
    try {
      const result = await stream.send(text, {
        activityId: activeActivityId,
        personaId: activePersonaId ?? undefined,
        quickAction: { item_id: itemId, type: 'gift' },
        sceneId,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onChunk: (_delta, total) => {
          streamedText = total;
          updateStreamingCompanionMessage(streamingMessageId, total);
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
      finishStreamingCompanionMessage(streamingMessageId, result, serverMessageId, messageSceneId);
      notifyNewReply();
      void relationship.refresh();
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        setQuotaModalVisible(true);
      } else {
        pushError(error instanceof Error ? error.message : 'Quick action failed.');
      }
      cleanupFailedStreamingCompanionMessage(streamingMessageId, streamedText);
    }
  }, [activeActivityId, activePersonaId, appendLocalUserMessage, appendStreamingCompanionMessage, cleanupFailedStreamingCompanionMessage, finishStreamingCompanionMessage, notifyNewReply, pushError, relationship, remainingSeconds, sceneId, showInviteNotice, stream, updateStreamingCompanionMessage]);

  const handleStoryChoice = useCallback(async (choice: StoryChoice) => {
    if (!sceneId || stream.isStreaming || isResolvingStory) return;
    setIsResolvingStory(true);
    history.appendMessage({
      companion_id: companionId,
      content: choice.user_narration,
      created_at: new Date().toISOString(),
      id: `local-story-user-${Date.now()}`,
      role: 'user',
      scene_id: sceneId,
    });
    try {
      const result = await resolveStoryChoice(companionId, choice.id, {
        activity_id: activeActivityId ?? null,
        scene_id: sceneId,
      });
      history.appendMessage({
        companion_id: companionId,
        content: result.result_narration,
        created_at: new Date().toISOString(),
        id: `local-story-result-${Date.now()}`,
        role: 'companion',
        scene_id: sceneId,
      });
      if (result.transition_mode === 'scene' && result.target_scene) {
        setSceneId(result.target_scene.id);
        setSceneArt(result.target_scene.art_url);
        history.appendMessage({
          companion_id: companionId,
          content: sceneTransitionText(result.target_scene.name),
          created_at: new Date().toISOString(),
          id: `local-story-transition-${Date.now()}`,
          role: 'companion',
          scene_id: result.target_scene.id,
        });
      }
      if (result.unlocks.length > 0) {
        setLastUnlocks(result.unlocks);
        setUnlockToken((token) => token + 1);
      }
      setStoryMoment(null);
      notifyNewReply();
      void relationship.refresh();
    } catch (error) {
      pushError(error instanceof Error ? error.message : 'Story moment could not be resolved.');
    } finally {
      setIsResolvingStory(false);
    }
  }, [activeActivityId, companionId, history, isResolvingStory, notifyNewReply, pushError, relationship, sceneId, stream.isStreaming]);

  const handleClearConfirm = useCallback(async () => {
    setIsClearing(true);
    try {
      await clearChatHistory(companionId);
      history.reset();
      setClearConfirmVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to clear conversation.';
      pushError(message);
    } finally {
      setIsClearing(false);
    }
  }, [companionId, history, pushError]);

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

  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (Platform.OS !== 'web') {
        return;
      }
      const native = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
      if (native.key === 'Enter' && !native.shiftKey) {
        event.preventDefault?.();
        void handleSend();
      }
    },
    [handleSend],
  );

  const shownEmotion = currentEmotion;

  const updateHistoryMessage = history.updateMessage;
  const handleMomentReady = useCallback((messageId: string, moment: ChatMomentImage) => {
    const previousMoment = history.messages.find((message) => message.id === messageId)?.moment_image ?? null;
    const isNewSucceededMoment =
      moment.status === 'succeeded' &&
      (previousMoment?.status !== 'succeeded' || previousMoment.output_key !== moment.output_key);
    updateHistoryMessage(messageId, (message) => ({ ...message, moment_image: moment }));
    if (isNewSucceededMoment) {
      notifyMomentReady(messageId);
    }
  }, [history.messages, notifyMomentReady, updateHistoryMessage]);
  usePendingMomentImages({ messages: history.messages, onUpdate: handleMomentReady });
  const renderItem = useCallback(({ item }: { item: ChatMessage }) => {
    const role = item.role === 'assistant' ? 'companion' : item.role;
    const isServerCompanion = role === 'companion' && !item.id.startsWith('local-');
    const isServerUser = role === 'user' && !item.id.startsWith('local-');

    if (isServerUser && editMessage.editingId === item.id) {
      return (
        <UserMessageEditor
          text={editMessage.editingText}
          isSaving={editMessage.isSaving}
          onChangeText={editMessage.setEditingText}
          onSave={editMessage.saveEdit}
          onCancel={editMessage.cancelEdit}
        />
      );
    }

    return (
      <View>
        <MessageBubble
          content={item.content}
          isPending={role === 'companion' && item.id.startsWith('local-') && item.content.length === 0}
          role={role}
        />
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
  }, [editMessage, handleMomentReady, messageActions]);

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  if (!companionId) {
    return (
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Chat" />
        <EmptyState
          title="Missing companion"
          description="No companion was provided for this conversation."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  if (history.isLoadingInitial) {
    return (
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title={companion.name} />
        <LoadingScreen label="Loading conversation..." />
      </View>
    );
  }

  const currentScene = scenes.find((scene) => scene.id === sceneId) ?? null;
  const currentSceneText = [
    currentScene?.id ?? sceneId ?? '',
    currentScene?.name ?? '',
    currentScene?.mood ?? '',
    ...(currentScene?.tags ?? []),
  ].join(' ').toLowerCase();
  const canOrderCoffee = Boolean(sceneId) && (currentSceneText.includes('coffee') || currentSceneText.includes('cafe'));
  const sendDisabled = stream.isStreaming || remainingSeconds > 0 || draft.trim().length === 0;
  const canUseQuickAction = Boolean(sceneId) && !stream.isStreaming && remainingSeconds === 0;

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar
        showBack
        title={companion.name}
        right={
          <View className="flex-row items-center gap-2">
            <View className="flex-row items-center overflow-hidden rounded-xl border border-app-line bg-app-card">
              <Pressable
                accessibilityLabel={autoVoice.enabled ? 'Turn off auto voice' : 'Turn on auto voice'}
                accessibilityRole="button"
                onPress={autoVoice.toggle}
                className={`h-10 w-10 items-center justify-center ${autoVoice.enabled ? 'bg-app-primarySoft' : 'bg-app-card'}`}
              >
                <Ionicons
                  color={autoVoice.enabled ? '#FF4D7E' : '#687076'}
                  name={autoVoice.enabled ? 'volume-high' : 'volume-mute-outline'}
                  size={20}
                />
              </Pressable>
              <View className="h-6 w-px bg-app-line" />
              <Pressable
                accessibilityLabel="Voice settings"
                accessibilityRole="button"
                onPress={() => setVoiceSettingsVisible(true)}
                className={`h-10 w-10 items-center justify-center ${voiceSettingsVisible ? 'bg-app-primarySoft' : 'bg-app-card'}`}
              >
                <Ionicons color={voiceSettingsVisible ? '#FF4D7E' : '#687076'} name="settings-outline" size={20} />
              </Pressable>
            </View>
            <Pressable
              accessibilityLabel="Clear conversation"
              accessibilityRole="button"
              onPress={() => setClearConfirmVisible(true)}
              className="h-10 w-10 items-center justify-center rounded-lg"
            >
              <Ionicons color="#11181C" name="trash-outline" size={20} />
            </Pressable>
          </View>
        }
      />

      <PortraitBar
        artEmotions={companion.art_emotions}
        artUrl={companion.art_url}
        emotion={shownEmotion}
        name={companion.name}
        sceneArt={sceneArt}
      />

      <ChatRelationshipHud goal={relationship.goal} />

      <PersonaSelector personas={personas} selectedId={activePersonaId} onSelect={setSelectedPersonaId} />

      <SignalFeedback signals={lastSignals} token={signalToken} />

      <UnlockCelebration
        unlocks={lastUnlocks}
        token={unlockToken}
        onInviteScene={(unlock) => {
          if (!unlock.scene_id) return;
          void sendInviteToTarget({
            art_url: null,
            id: unlock.scene_id,
            mood: '',
            name: unlock.scene_name ?? 'the new place',
          });
        }}
        onViewScene={(unlock) => {
          if (unlock.scene_id) router.push(`/scene/${encodeURIComponent(unlock.scene_id)}` as Href);
        }}
      />

      <View className="border-b border-app-line bg-app-bg px-3 py-3">
        <CompanionStoryPanel
          companionId={companionId}
          compact
          onChanged={relationship.refresh}
          showEditor={false}
        />
      </View>

      <ActivityContextBanner
        activity={activity}
        isMutating={activityActions.isMutating}
        onCancel={handleCancelActivity}
        onComplete={handleCompleteActivity}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="relative flex-1">
          {history.messages.length === 0 && !stream.isStreaming ? (
            <EmptyState
              title="Start the conversation"
              description="Send a message to begin chatting with this companion."
            />
          ) : (
            <FlatList
              ref={listRef}
              data={items}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              contentContainerStyle={{ paddingVertical: 12 }}
              onContentSizeChange={handleContentSizeChange}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              ListHeaderComponent={
                history.hasMore ? (
                  <View className="items-center px-4 py-3">
                    <Pressable
                      accessibilityRole="button"
                      disabled={history.isLoadingMore}
                      onPress={handleLoadMore}
                      className={`rounded-full border border-app-line bg-app-card px-4 py-2 ${
                        history.isLoadingMore ? 'opacity-50' : 'opacity-100'
                      }`}
                    >
                      {history.isLoadingMore ? (
                        <ActivityIndicator color="#1E6B52" size="small" />
                      ) : (
                        <Text className="text-sm font-medium text-app-primary">Load earlier messages</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null
              }
            />
          )}
          {pendingNotice ? (
            <ChatScrollNotice
              label={pendingNotice.label}
              onPress={() => {
                if (pendingNotice.kind === 'moment') {
                  jumpToMessage(pendingNotice.messageId);
                } else {
                  jumpToBottom();
                }
              }}
            />
          ) : null}
        </View>

        {remainingSeconds > 0 ? (
          <View className="border-t border-app-line bg-app-warning/10 px-4 py-2">
            <Text className="text-center text-sm font-medium text-app-warning">
              {`Slow down — try again in ${remainingSeconds}s`}
            </Text>
          </View>
        ) : null}

        {inviteNotice ? (
          <View className="border-t border-app-line bg-app-primarySoft px-4 py-2">
            <Text className="text-center text-sm font-medium text-app-primary">{inviteNotice}</Text>
          </View>
        ) : null}

        <StoryActionBar
          disabled={stream.isStreaming || isResolvingStory}
          moment={storyMoment}
          onSelect={(choice) => {
            void handleStoryChoice(choice);
          }}
        />

        <View className="border-t border-app-line bg-app-card px-3 py-3">
          <View className="mb-2 flex-row flex-wrap gap-2">
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
            />
          </View>
          <View className="flex-row items-end gap-2">
            <TextInput
              accessibilityLabel="Message input"
              multiline
              onChangeText={setDraft}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              placeholderTextColor="#687076"
              value={draft}
              className="max-h-32 min-h-11 flex-1 rounded-2xl border border-app-line bg-app-bg px-4 py-2 text-base text-app-text"
            />
            <Pressable
              accessibilityLabel="Send message"
              accessibilityRole="button"
              disabled={sendDisabled}
              onPress={() => void handleSend()}
              className={`h-11 w-11 items-center justify-center rounded-full ${
                sendDisabled ? 'bg-app-primary opacity-40' : 'bg-app-primary opacity-100'
              }`}
            >
              {stream.isStreaming ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons color="#FFFFFF" name="arrow-up" size={20} />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <InvitePopup
        visible={invitePickerVisible}
        loading={inviteLoading}
        targets={inviteTargets}
        companionName={companion.name}
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

      <Modal
        animationType="fade"
        onRequestClose={() => setVoiceSettingsVisible(false)}
        transparent
        visible={voiceSettingsVisible}
      >
        <View className="flex-1 justify-center bg-black/50 px-4 py-8">
          <View className="max-h-full rounded-2xl bg-app-card">
            <View className="flex-row items-start justify-between gap-4 border-b border-app-line px-5 py-4">
              <View className="min-w-0 flex-1">
                <Text className="text-xl font-semibold text-app-text">Voice settings</Text>
                <Text className="mt-1 text-sm leading-5 text-app-muted">
                  First voice generation for a reply costs credits. Replays with the same voice are free.
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close voice settings"
                accessibilityRole="button"
                onPress={() => setVoiceSettingsVisible(false)}
                className="h-10 w-10 items-center justify-center rounded-lg"
              >
                <Ionicons color="#687076" name="close" size={20} />
              </Pressable>
            </View>
            <ScrollView className="px-5 py-5" keyboardShouldPersistTaps="handled">
              <VoiceSettingsPanel
                initialGender={companion.gender}
                initialValue={voiceSettings}
                isSaving={isSavingVoiceSettings}
                onSave={saveVoiceSettings}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setQuotaModalVisible(false)}
        transparent
        visible={quotaModalVisible}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full max-w-sm rounded-2xl bg-app-card p-6">
            <Text className="text-xl font-semibold text-app-text">Out of credits</Text>
            <Text className="mt-3 text-sm leading-5 text-app-muted">
              You don&apos;t have enough credits. Top up or upgrade to Pro to keep chatting.
            </Text>
            <View className="mt-5 gap-2">
              <Button
                label="Get credits"
                onPress={() => {
                  setQuotaModalVisible(false);
                  router.push(BILLING_ROUTE);
                }}
              />
              <Button
                label="Not now"
                onPress={() => setQuotaModalVisible(false)}
                variant="secondary"
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setClearConfirmVisible(false)}
        transparent
        visible={clearConfirmVisible}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full max-w-sm rounded-2xl bg-app-card p-6">
            <Text className="text-xl font-semibold text-app-text">Clear conversation?</Text>
            <Text className="mt-3 text-sm leading-5 text-app-muted">
              All messages in this conversation will be permanently deleted. Relationship progress will be kept.
            </Text>
            <View className="mt-5 gap-2">
              <Button
                isLoading={isClearing}
                label="Clear conversation"
                onPress={() => void handleClearConfirm()}
                variant="danger"
              />
              <Button
                label="Cancel"
                onPress={() => setClearConfirmVisible(false)}
                variant="secondary"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChatScrollNotice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 bottom-3 items-center px-4">
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className="min-h-10 flex-row items-center gap-2 rounded-full border border-app-primary/25 bg-app-primary px-4 shadow-card"
      >
        <Ionicons color="#FFFFFF" name="arrow-down" size={16} />
        <Text className="text-sm font-semibold text-white">{label}</Text>
      </Pressable>
    </View>
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
        selected ? 'border-app-primary bg-app-primarySoft' : 'border-app-line bg-app-bg'
      } ${disabled ? 'opacity-50' : 'opacity-100'}`}
    >
      <Ionicons color="#6E59C7" name={icon} size={15} />
      <Text className="text-xs font-semibold text-app-text">{label}</Text>
    </Pressable>
  );
}
