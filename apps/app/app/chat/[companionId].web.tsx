import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageStyle,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  type ViewStyle,
} from 'react-native';

import {
  ensureCompanionCutout,
  getCompanion,
  getCompanionCutout,
  getChatVoiceSettings,
  getDailyState,
  getInviteTargets,
  getScenes,
  getStoryMoment,
  mediaSource,
  resolveStoryChoice,
  updateChatVoiceSettings,
} from '@/api/companion-client';
import type {
  ChatInviteResult,
  ChatMessage,
  ChatMomentImage,
  ChatVoiceSettingsResponse,
  CompanionDetail,
  EventResponseItem,
  EventResolveResponse,
  InviteTarget,
  RelationshipDimensions,
  Scene,
  StoryChoice,
  StoryMoment,
} from '@/api/types';
import { ActivityContextBanner } from '@/components/ActivityContextBanner';
import { ChatRelationshipHud } from '@/components/ChatRelationshipHud';
import { MessageBubble } from '@/components/MessageBubble';
import { MomentImageCapture } from '@/components/MomentImageCapture';
import { SceneArtwork, SceneStageBackdrop } from '@/components/SceneArtwork';
import { SignalFeedback } from '@/components/SignalFeedback';
import { StoryActionBar } from '@/components/StoryActionBar';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebUnlockCelebrationOverlay, type WebCelebrationItem } from '@/components/web/WebUnlockCelebrationOverlay';
import { WebButton, WebDialog, WebEmptyState, WebLoading, WebTag } from '@/components/web/ui';
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
import { ProfileOutfitPanel } from '@/components/ProfileOutfitPanel';
import { useStreamingChatMessages } from '@/hooks/use-streaming-chat-messages';
import { useMessageActions } from '@/hooks/use-message-actions';
import { MessageActions } from '@/components/MessageActions';
import { useEditMessage } from '@/hooks/use-edit-message';
import { UserMessageEditor } from '@/components/UserMessageEditor';
import { VoiceSettingsPanel } from '@/components/VoiceSettingsPanel';
import { inviteTextForTarget, sceneTransitionText } from '@/utils/chat-actions';
import { detectChatLanguage, type ChatLanguage } from '@/utils/chat-language';
import { customSceneActionText, sceneActionLabel, sceneActionsFor, sceneActionText, type SceneAction } from '@/utils/scene-actions';

const CUSTOM_SCENE_ACTION_MAX_LENGTH = 120;

const EVENT_TITLES: Record<EventResponseItem['event_type'], string> = {
  confession: 'A confession',
  conflict: 'A tense moment',
  gift: 'A small gift',
  invitation: 'An invitation',
  milestone: 'A milestone',
};

type PendingArrival = {
  createdAt: number;
  target: InviteTarget;
};

type StoredCurrentScene = {
  art_url: string | null;
  id: string;
  name: string | null;
  savedAt: number;
};

type SceneSource = 'confirmed' | 'daily' | 'history' | 'stored' | 'url' | null;

const pendingArrivalKey = (companionId: string) => `xtbit.chat.pendingArrival.${companionId}`;
const currentSceneKey = (companionId: string) => `xtbit.chat.currentScene.${companionId}`;

function createdAtMs(value: ChatMessage['created_at']): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const ARRIVAL_COPY: Record<ChatLanguage, {
  arrivedNotice: (sceneName: string) => string;
  arriveNow: string;
  later: string;
  pendingLabel: (sceneName: string) => string;
  promptDescription: (sceneName: string) => string;
  promptTitle: (name: string, sceneName: string) => string;
  refused: (name: string) => string;
}> = {
  en: {
    arrivedNotice: (sceneName) => `You arrived at ${sceneName} together.`,
    arriveNow: 'Arrive now',
    later: 'Later',
    pendingLabel: (sceneName) => `Go to ${sceneName}`,
    promptDescription: (sceneName) => `Switch the conversation into ${sceneName} now, or keep it waiting as a pending destination.`,
    promptTitle: (name, sceneName) => `${name} agreed to go to ${sceneName}`,
    refused: (name) => `${name} did not take you up on it.`,
  },
  zh: {
    arrivedNotice: (sceneName) => `你们已经一起到了${sceneName}。`,
    arriveNow: '立即到达',
    later: '稍后',
    pendingLabel: (sceneName) => `前往${sceneName}`,
    promptDescription: (sceneName) => `现在把对话切换到${sceneName}，或者先挂起，稍后再出发。`,
    promptTitle: (name, sceneName) => `${name}同意一起去${sceneName}`,
    refused: (name) => `${name}没有答应这次邀约。`,
  },
};

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
  const [sceneSource, setSceneSource] = useState<SceneSource>(initialSceneId ? 'url' : null);
  const router = useRouter();
  const { pushError } = useErrorBanner();
  const history = useChatHistory(companionId);
  const streamingMessages = useStreamingChatMessages(companionId, history);
  const stream = useChatStream(companionId);
  const relationship = useChatRelationship(companionId);
  const personasState = usePersonas();
  const personas = personasState.data?.personas ?? [];
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const activePersonaId =
    selectedPersonaId ?? personas.find((p) => p.is_default)?.id ?? personas[0]?.id ?? null;
  const autoVoice = useAutoVoice();
  const activityState = useActivity(activityId);
  const activityActions = useActivities();
  const { activity, refresh: refreshActivity, setActivity } = activityState;
  const activeActivityId = activity?.status === 'active' ? activityId : undefined;
  const pendingEvents = usePendingEvents(null);
  const [companion, setCompanion] = useState<CompanionDetail | null>(null);
  const [artCutoutUrl, setArtCutoutUrl] = useState<string | null>(null);
  const [currentEmotion, setCurrentEmotion] = useState<ChatEmotion>('neutral');
  const [draft, setDraft] = useState('');
  const [quotaModalVisible, setQuotaModalVisible] = useState(false);
  const messageActions = useMessageActions(companionId, history, pushError, () => setQuotaModalVisible(true));
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [lastSignals, setLastSignals] = useState<Partial<RelationshipDimensions> | null>(null);
  const [signalToken, setSignalToken] = useState(0);
  // spec-036: in-chat invitation to go somewhere.
  const [invitePickerVisible, setInvitePickerVisible] = useState(false);
  const [inviteTargets, setInviteTargets] = useState<InviteTarget[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [pendingArrival, setPendingArrival] = useState<PendingArrival | null>(null);
  const [arrivalPrompt, setArrivalPrompt] = useState<PendingArrival | null>(null);
  const [outfitDialogVisible, setOutfitDialogVisible] = useState(false);
  const [voiceDialogVisible, setVoiceDialogVisible] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<ChatVoiceSettingsResponse | null>(null);
  const [isSavingVoiceSettings, setIsSavingVoiceSettings] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [customActionText, setCustomActionText] = useState('');
  const [celebrationQueue, setCelebrationQueue] = useState<WebCelebrationItem[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [storyMoment, setStoryMoment] = useState<StoryMoment | null>(null);
  const [isResolvingStory, setIsResolvingStory] = useState(false);
  const threadScrollRef = useRef<FlatList<ChatMessage>>(null);
  const activeSceneChangedThisSessionRef = useRef(Boolean(initialSceneId));
  const hasReconciledInitialSceneRef = useRef(Boolean(initialSceneId));
  const hasCheckedStoredSceneRef = useRef(Boolean(initialSceneId));
  const historySceneTargetRef = useRef<string | null>(null);
  const sceneIdRef = useRef(sceneId);
  const defaultDailySceneRef = useRef(false);
  const restoredStoredSceneRef = useRef(Boolean(initialSceneId));
  const restoredSceneSavedAtRef = useRef<number | null>(null);
  // Streaming replies are real local messages now, so the same bubble grows in place.
  const items = history.messages;
  const chatLanguage = useMemo(
    () => detectChatLanguage(history.messages, draft),
    [draft, history.messages],
  );
  const arrivalCopy = ARRIVAL_COPY[chatLanguage];
  const autoScroll = useChatAutoScroll({
    getItems: () => items,
    listRef: threadScrollRef,
  });
  const {
    detachFromBottom,
    followBottom,
    handleContentSizeChange,
    handleScroll,
    jumpToBottom,
    jumpToMessage,
    notifyMomentReady,
    notifyNewReply,
    pendingNotice,
    resetForThread,
  } = autoScroll;
  const editMessage = useEditMessage(companionId, history, {
    onError: pushError,
    onSaved: () => {
      notifyNewReply();
      void relationship.refresh();
    },
  });
  const {
    appendLocalUserMessage,
    appendStreamingCompanionMessage,
    cleanupFailedStreamingCompanionMessage,
    finishStreamingCompanionMessage,
    pushStreamingCompanionDelta,
  } = streamingMessages;

  useEffect(() => {
    sceneIdRef.current = sceneId;
  }, [sceneId]);

  useEffect(() => {
    activeSceneChangedThisSessionRef.current = Boolean(initialSceneId);
    hasReconciledInitialSceneRef.current = Boolean(initialSceneId);
    hasCheckedStoredSceneRef.current = Boolean(initialSceneId);
    restoredStoredSceneRef.current = Boolean(initialSceneId);
    defaultDailySceneRef.current = false;
    historySceneTargetRef.current = null;
    restoredSceneSavedAtRef.current = null;
    setSceneSource(initialSceneId ? 'url' : null);
  }, [companionId, initialSceneId]);

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

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

  useEffect(() => {
    if (!initialSceneId) return;
    activeSceneChangedThisSessionRef.current = true;
    defaultDailySceneRef.current = false;
    hasCheckedStoredSceneRef.current = true;
    restoredStoredSceneRef.current = true;
    hasReconciledInitialSceneRef.current = true;
    historySceneTargetRef.current = null;
    restoredSceneSavedAtRef.current = null;
    setSceneId(initialSceneId);
    setSceneArt(initialSceneArt);
    setSceneName(null);
    setSceneSource('url');
  }, [initialSceneArt, initialSceneId]);

  const refreshCompanionDetail = useCallback(async () => {
    const detail = await getCompanion(companionId);
    setCompanion(detail);
    setArtCutoutUrl(detail.art_cutout_url ?? null);
  }, [companionId]);

  useEffect(() => {
    let cancelled = false;
    getCompanion(companionId)
      .then((detail) => {
        if (!cancelled) {
          setCompanion(detail);
          setArtCutoutUrl(detail.art_cutout_url ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setCompanion(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companionId]);

  useEffect(() => {
    if (!companionId || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(pendingArrivalKey(companionId));
      if (!raw) {
        setPendingArrival(null);
        return;
      }
      const parsed = JSON.parse(raw) as PendingArrival;
      if (parsed?.target?.id && parsed.target.name) {
        setPendingArrival(parsed);
      }
    } catch {
      window.localStorage.removeItem(pendingArrivalKey(companionId));
      setPendingArrival(null);
    }
  }, [companionId]);

  useEffect(() => {
    if (!companionId || initialSceneId || typeof window === 'undefined') {
      hasCheckedStoredSceneRef.current = true;
      return;
    }
    try {
      const raw = window.localStorage.getItem(currentSceneKey(companionId));
      hasCheckedStoredSceneRef.current = true;
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredCurrentScene;
      if (!parsed?.id) return;
      defaultDailySceneRef.current = false;
      restoredStoredSceneRef.current = true;
      restoredSceneSavedAtRef.current = typeof parsed.savedAt === 'number' ? parsed.savedAt : null;
      setSceneId(parsed.id);
      setSceneArt(parsed.art_url ?? null);
      setSceneName(parsed.name ?? null);
      setSceneSource('stored');
    } catch {
      window.localStorage.removeItem(currentSceneKey(companionId));
      hasCheckedStoredSceneRef.current = true;
      restoredSceneSavedAtRef.current = null;
    }
  }, [companionId, initialSceneId]);

  useEffect(() => {
    if (history.isLoadingInitial) return;
    hasReconciledInitialSceneRef.current = true;
    if (initialSceneId || activeSceneChangedThisSessionRef.current) return;
    let latestSceneMessage: ChatMessage | null = null;
    for (let i = history.messages.length - 1; i >= 0; i -= 1) {
      const message = history.messages[i];
      if (message?.scene_id) {
        latestSceneMessage = message;
        break;
      }
    }
    if (!latestSceneMessage?.scene_id || latestSceneMessage.scene_id === sceneId) return;

    const latestSceneTime = createdAtMs(latestSceneMessage.created_at);
    const restoredSceneSavedAt = restoredSceneSavedAtRef.current;
    if (restoredSceneSavedAt !== null && latestSceneTime !== null && restoredSceneSavedAt > latestSceneTime) {
      return;
    }

    const scene = scenes.find((candidate) => candidate.id === latestSceneMessage.scene_id) ?? null;
    historySceneTargetRef.current = latestSceneMessage.scene_id;
    defaultDailySceneRef.current = false;
    setSceneId(latestSceneMessage.scene_id);
    setSceneArt(scene?.art_url ?? null);
    setSceneName(scene?.name ?? null);
    setSceneSource('history');
    restoredSceneSavedAtRef.current = null;
  }, [history.isLoadingInitial, history.messages, initialSceneId, sceneId, scenes]);

  useEffect(() => {
    if (
      !companionId ||
      initialSceneId ||
      sceneId ||
      history.isLoadingInitial ||
      activeSceneChangedThisSessionRef.current ||
      !hasCheckedStoredSceneRef.current ||
      restoredStoredSceneRef.current ||
      !hasReconciledInitialSceneRef.current ||
      historySceneTargetRef.current !== null
    ) {
      return;
    }

    const hasHistoricalScene = history.messages.some((message) => Boolean(message.scene_id));
    if (hasHistoricalScene) return;

    let cancelled = false;
    getDailyState(companionId)
      .then((dailyState) => {
        if (cancelled || sceneIdRef.current || activeSceneChangedThisSessionRef.current) return;
        const dailySceneId = dailyState.scene.id;
        if (!dailySceneId) return;
        const catalogScene = scenes.find((candidate) => candidate.id === dailySceneId) ?? null;
        defaultDailySceneRef.current = true;
        setSceneId(dailySceneId);
        setSceneArt(dailyState.scene.art_url ?? catalogScene?.art_url ?? null);
        setSceneName(catalogScene?.name ?? null);
        setSceneSource('daily');
      })
      .catch(() => {
        // Daily state is a fallback only. If it is unavailable, plain chat still works.
      });

    return () => {
      cancelled = true;
    };
  }, [companionId, history.isLoadingInitial, history.messages, initialSceneId, sceneId, scenes]);

  useEffect(() => {
    if (
      !companionId ||
      !sceneId ||
      !hasReconciledInitialSceneRef.current ||
      (historySceneTargetRef.current !== null && historySceneTargetRef.current !== sceneId) ||
      typeof window === 'undefined'
    ) {
      return;
    }
    if (historySceneTargetRef.current === sceneId) {
      historySceneTargetRef.current = null;
    }
    if (defaultDailySceneRef.current && !activeSceneChangedThisSessionRef.current && !initialSceneId) {
      return;
    }
    const scene = scenes.find((candidate) => candidate.id === sceneId) ?? null;
    const stored: StoredCurrentScene = {
      art_url: sceneArt ?? scene?.art_url ?? null,
      id: sceneId,
      name: sceneName ?? scene?.name ?? null,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(currentSceneKey(companionId), JSON.stringify(stored));
  }, [companionId, initialSceneId, sceneArt, sceneId, sceneName, scenes]);

  useEffect(() => {
    if (!companion || artCutoutUrl) return;
    let cancelled = false;
    let timeout: ReturnType<typeof globalThis.setTimeout> | null = null;

    const poll = async (ensure: boolean) => {
      try {
        const status = ensure
          ? await ensureCompanionCutout(companion.id)
          : await getCompanionCutout(companion.id);
        if (cancelled) return;
        if (status.status === 'succeeded' && status.art_cutout_url) {
          setArtCutoutUrl(status.art_cutout_url);
          return;
        }
        if (status.status === 'pending' || status.status === 'processing') {
          timeout = globalThis.setTimeout(() => {
            void poll(false);
          }, 2400);
        }
      } catch {
        // Cutout is an enhancement; the clean base portrait remains usable.
      }
    };

    void poll(true);
    return () => {
      cancelled = true;
      if (timeout) globalThis.clearTimeout(timeout);
    };
  }, [artCutoutUrl, companion]);

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

  const handleLoadMore = useCallback(async () => {
    detachFromBottom();
    await history.loadMore();
  }, [detachFromBottom, history]);

  useEffect(() => {
    resetForThread();
  }, [companionId, resetForThread]);

  useEffect(() => {
    if (history.isLoadingInitial) {
      return;
    }
    resetForThread();
  }, [history.isLoadingInitial, resetForThread]);

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

  const keyExtractor = useCallback((item: ChatMessage) => item.id, []);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<ChatMessage>) => {
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
          isStreaming={role === 'companion' && item.id.startsWith('local-')}
          role={role}
          companionName={role === 'companion' ? companion?.name : null}
        />
        {isServerUser ? (
          <View className="w-full flex-row justify-end px-5 pb-1">
            <Pressable
              accessibilityRole="button"
              disabled={editMessage.isSaving}
              onPress={() => editMessage.beginEdit(item.id, item.content)}
            >
              <Text className="text-xs font-semibold text-rose-50/60">Edit</Text>
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
  }, [companion?.name, editMessage, handleMomentReady, messageActions]);

  usePendingMomentImages({ messages: history.messages, onUpdate: handleMomentReady });
  const remainingSeconds = useMemo(() => {
    if (!rateLimitedUntil) return 0;
    return Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
  }, [now, rateLimitedUntil]);

  const showInviteNotice = useCallback((message: string) => {
    setInviteNotice(message);
    globalThis.setTimeout(() => setInviteNotice(null), 3200);
  }, []);

  const persistPendingArrival = useCallback((arrival: PendingArrival | null) => {
    setPendingArrival(arrival);
    if (typeof window === 'undefined') return;
    const key = pendingArrivalKey(companionId);
    if (!arrival) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(arrival));
  }, [companionId]);

  const enqueueCelebrations = useCallback((items: WebCelebrationItem[]) => {
    if (items.length === 0) return;
    setCelebrationQueue((current) => [...current, ...items]);
  }, []);

  const closeCelebration = useCallback(() => {
    setCelebrationQueue((current) => current.slice(1));
  }, []);

  const arriveAtPendingScene = useCallback(async (arrival: PendingArrival) => {
    setArrivalPrompt(null);
    persistPendingArrival(null);
    if (activeActivityId) {
      setActivity(null);
    }
    activeSceneChangedThisSessionRef.current = true;
    setSceneId(arrival.target.id);
    setSceneArt(arrival.target.art_url ?? null);
    setSceneName(arrival.target.name);
    setSceneSource('confirmed');
    history.appendMessage({
      companion_id: companionId,
      content: sceneTransitionText(arrival.target.name, chatLanguage),
      created_at: new Date().toISOString(),
      id: `local-scene-transition-${Date.now()}`,
      role: 'companion',
      scene_id: arrival.target.id,
    });
    showInviteNotice(arrivalCopy.arrivedNotice(arrival.target.name));
    followBottom(true);
    if (activeActivityId) {
      try {
        await activityActions.complete(activeActivityId);
      } catch (error) {
        pushError(error instanceof Error ? error.message : 'Activity could not be completed.');
      }
    }
  }, [activeActivityId, activityActions, arrivalCopy, chatLanguage, companionId, followBottom, history, persistPendingArrival, pushError, setActivity, showInviteNotice]);

  const handleInviteResult = useCallback(
    (invite: ChatInviteResult, target: InviteTarget | null) => {
      if (invite.accepted && invite.scene_id) {
        const arrival: PendingArrival = {
          createdAt: Date.now(),
          target: {
            art_url: invite.scene_art_url ?? target?.art_url ?? null,
            id: invite.scene_id,
            mood: target?.mood ?? '',
            name: target?.name ?? 'the new place',
          },
        };
        persistPendingArrival(arrival);
        setArrivalPrompt(arrival);
      } else {
        showInviteNotice(arrivalCopy.refused(companion?.name ?? 'They'));
      }
    },
    [arrivalCopy, companion?.name, persistPendingArrival, showInviteNotice],
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

  const saveVoiceSettings = useCallback(async (value: { voice_id: string; voice_speed: ChatVoiceSettingsResponse['voice_speed'] }) => {
    setIsSavingVoiceSettings(true);
    try {
      const next = await updateChatVoiceSettings(companionId, value);
      setVoiceSettings(next);
      setVoiceDialogVisible(false);
    } finally {
      setIsSavingVoiceSettings(false);
    }
  }, [companionId]);

  const sendInviteToTarget = useCallback(async (target: InviteTarget) => {
    if (stream.isStreaming || remainingSeconds > 0) return;
    const text = inviteTextForTarget(target, chatLanguage);
    const messageSceneId = sceneId ?? null;
    appendLocalUserMessage(text, messageSceneId);
    const streamingMessageId = appendStreamingCompanionMessage(messageSceneId);
    followBottom(false);

    let serverMessageId = '';
    let streamedText = '';
    try {
      const result = await stream.send(text, {
        activityId: activeActivityId,
        inviteSceneId: target.id,
        personaId: activePersonaId ?? undefined,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onChunk: (delta) => {
          streamedText += delta;
          pushStreamingCompanionDelta(streamingMessageId, delta);
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
          enqueueCelebrations(unlocks);
        },
        sceneId,
      });
      finishStreamingCompanionMessage(streamingMessageId, result, serverMessageId, messageSceneId);
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
        pushError(error instanceof Error ? error.message : 'Failed to send invitation.');
      }
      cleanupFailedStreamingCompanionMessage(streamingMessageId, streamedText);
    }
  }, [activeActivityId, activePersonaId, appendLocalUserMessage, appendStreamingCompanionMessage, autoVoice.enabled, chatLanguage, cleanupFailedStreamingCompanionMessage, enqueueCelebrations, finishStreamingCompanionMessage, followBottom, handleInviteResult, messageActions, notifyNewReply, pushError, pushStreamingCompanionDelta, relationship, remainingSeconds, sceneId, stream]);

  const handleInviteSelect = useCallback((target: InviteTarget) => {
    setInvitePickerVisible(false);
    void sendInviteToTarget(target);
  }, [sendInviteToTarget]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || stream.isStreaming || remainingSeconds > 0) return;

    const messageSceneId = sceneId ?? null;
    appendLocalUserMessage(text, messageSceneId);
    const streamingMessageId = appendStreamingCompanionMessage(messageSceneId);
    setDraft('');
    followBottom(false);

    let serverMessageId = '';
    let streamedText = '';
    try {
      const result = await stream.send(text, {
        activityId: activeActivityId,
        personaId: activePersonaId ?? undefined,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onChunk: (delta) => {
          streamedText += delta;
          pushStreamingCompanionDelta(streamingMessageId, delta);
        },
        onEmotion: (emotion) => setCurrentEmotion(emotion),
        onSignals: (signals) => {
          setLastSignals(signals);
          setSignalToken((token) => token + 1);
        },
        onUnlocks: (unlocks) => {
          enqueueCelebrations(unlocks);
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
      } else if (error instanceof ApiError && error.code === 'content_filter') {
        pushError(chatLanguage === 'zh'
          ? '这个内容被模型服务拒绝了，请换一种描述。'
          : 'That content was rejected by the model provider. Try a different description.');
      } else {
        pushError(error instanceof Error ? error.message : 'Failed to send message.');
      }
      cleanupFailedStreamingCompanionMessage(streamingMessageId, streamedText);
    }
  }, [activeActivityId, activePersonaId, appendLocalUserMessage, appendStreamingCompanionMessage, autoVoice.enabled, chatLanguage, cleanupFailedStreamingCompanionMessage, draft, enqueueCelebrations, finishStreamingCompanionMessage, followBottom, messageActions, notifyNewReply, pushError, pushStreamingCompanionDelta, relationship, remainingSeconds, sceneId, stream]);

  const sendSceneAction = useCallback(async (action: SceneAction) => {
    if (stream.isStreaming || remainingSeconds > 0) return;
    const text = sceneActionText(action, chatLanguage);
    const messageSceneId = sceneId ?? null;
    appendLocalUserMessage(text, messageSceneId);
    const streamingMessageId = appendStreamingCompanionMessage(messageSceneId);
    followBottom(false);

    let serverMessageId = '';
    let streamedText = '';
    try {
      const result = await stream.send(text, {
        activityId: activeActivityId,
        personaId: activePersonaId ?? undefined,
        quickAction: { action_id: action.id, type: 'scene_action' },
        sceneId,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onChunk: (delta) => {
          streamedText += delta;
          pushStreamingCompanionDelta(streamingMessageId, delta);
        },
        onEmotion: (emotion) => setCurrentEmotion(emotion),
        onQuickActionResult: (quick) => {
          showInviteNotice(quick.ok
            ? (chatLanguage === 'zh' ? '这个动作已经成为此刻的一部分。' : 'That action is part of this moment now.')
            : (chatLanguage === 'zh' ? '这个动作没能被记录。' : 'That gesture could not be recorded.'));
        },
        onSignals: (signals) => {
          setLastSignals(signals);
          setSignalToken((token) => token + 1);
        },
        onUnlocks: (unlocks) => {
          enqueueCelebrations(unlocks);
        },
      });
      finishStreamingCompanionMessage(streamingMessageId, result, serverMessageId, messageSceneId);
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
      } else if (error instanceof ApiError && error.code === 'content_filter') {
        pushError(chatLanguage === 'zh'
          ? '这个动作被模型服务拒绝了，请换一种描述。'
          : 'That action was rejected by the model provider. Try a different description.');
      } else {
        pushError(error instanceof Error ? error.message : 'Scene action failed.');
      }
      cleanupFailedStreamingCompanionMessage(streamingMessageId, streamedText);
    }
  }, [activeActivityId, activePersonaId, appendLocalUserMessage, appendStreamingCompanionMessage, autoVoice.enabled, chatLanguage, cleanupFailedStreamingCompanionMessage, enqueueCelebrations, finishStreamingCompanionMessage, followBottom, messageActions, notifyNewReply, pushError, pushStreamingCompanionDelta, relationship, remainingSeconds, sceneId, showInviteNotice, stream]);

  const sendCustomSceneAction = useCallback(async () => {
    if (stream.isStreaming || remainingSeconds > 0) return;
    const actionText = customActionText.trim();
    if (!sceneId) {
      pushError(chatLanguage === 'zh' ? '需要先进入一个场景，才能使用动作。' : 'Enter a scene before using an action.');
      return;
    }
    if (!actionText) {
      pushError(chatLanguage === 'zh' ? '先输入一个动作。' : 'Enter an action first.');
      return;
    }
    if (actionText.length > CUSTOM_SCENE_ACTION_MAX_LENGTH) {
      pushError(chatLanguage === 'zh'
        ? `动作最多 ${CUSTOM_SCENE_ACTION_MAX_LENGTH} 个字。`
        : `Actions can be at most ${CUSTOM_SCENE_ACTION_MAX_LENGTH} characters.`);
      return;
    }

    const text = customSceneActionText(actionText, chatLanguage);
    const messageSceneId = sceneId;
    appendLocalUserMessage(text, messageSceneId);
    const streamingMessageId = appendStreamingCompanionMessage(messageSceneId);
    followBottom(false);

    let serverMessageId = '';
    let streamedText = '';
    try {
      const result = await stream.send(text, {
        activityId: activeActivityId,
        personaId: activePersonaId ?? undefined,
        quickAction: { text: actionText, type: 'custom_scene_action' },
        sceneId,
        onDone: (info) => {
          serverMessageId = info.messageId;
        },
        onChunk: (delta) => {
          streamedText += delta;
          pushStreamingCompanionDelta(streamingMessageId, delta);
        },
        onEmotion: (emotion) => setCurrentEmotion(emotion),
        onQuickActionResult: (quick) => {
          showInviteNotice(quick.ok
            ? (chatLanguage === 'zh' ? '这个动作已经成为此刻的一部分。' : 'That action is part of this moment now.')
            : (chatLanguage === 'zh' ? '这个动作没能被记录。' : 'That gesture could not be recorded.'));
        },
        onSignals: (signals) => {
          setLastSignals(signals);
          setSignalToken((token) => token + 1);
        },
        onUnlocks: (unlocks) => {
          enqueueCelebrations(unlocks);
        },
      });
      finishStreamingCompanionMessage(streamingMessageId, result, serverMessageId, messageSceneId);
      setCustomActionText('');
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
      } else if (error instanceof ApiError && error.code === 'content_filter') {
        pushError(chatLanguage === 'zh'
          ? '这个动作被模型服务拒绝了，请换一种描述。'
          : 'That action was rejected by the model provider. Try a different description.');
      } else {
        pushError(error instanceof Error ? error.message : 'Custom action failed.');
      }
      cleanupFailedStreamingCompanionMessage(streamingMessageId, streamedText);
    }
  }, [activeActivityId, activePersonaId, appendLocalUserMessage, appendStreamingCompanionMessage, autoVoice.enabled, chatLanguage, cleanupFailedStreamingCompanionMessage, customActionText, enqueueCelebrations, finishStreamingCompanionMessage, followBottom, messageActions, notifyNewReply, pushError, pushStreamingCompanionDelta, relationship, remainingSeconds, sceneId, showInviteNotice, stream]);

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
    followBottom(false);
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
        activeSceneChangedThisSessionRef.current = true;
        setSceneId(result.target_scene.id);
        setSceneArt(result.target_scene.art_url);
        setSceneName(result.target_scene.name);
        setSceneSource('confirmed');
        history.appendMessage({
          companion_id: companionId,
          content: sceneTransitionText(result.target_scene.name, chatLanguage),
          created_at: new Date().toISOString(),
          id: `local-story-transition-${Date.now()}`,
          role: 'companion',
          scene_id: result.target_scene.id,
        });
      }
      if (result.unlocks.length > 0) {
        enqueueCelebrations(result.unlocks);
      }
      setStoryMoment(null);
      followBottom(true);
      void relationship.refresh();
    } catch (error) {
      pushError(error instanceof Error ? error.message : 'Story moment could not be resolved.');
    } finally {
      setIsResolvingStory(false);
    }
  }, [activeActivityId, chatLanguage, companionId, enqueueCelebrations, followBottom, history, isResolvingStory, pushError, relationship, sceneId, stream.isStreaming]);

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
  const stageCompanion = mediaSource(artCutoutUrl ?? companion?.art_url ?? null);
  const currentScene = scenes.find((scene) => scene.id === sceneId) ?? null;
  const displaySceneName = sceneName ?? currentScene?.name ?? null;
  const sceneSourceText = sceneSource
    ? (chatLanguage === 'zh'
      ? {
          confirmed: '已确认',
          daily: '今日状态',
          history: '历史恢复',
          stored: '本地恢复',
          url: '入口指定',
        }[sceneSource]
      : {
          confirmed: 'confirmed',
          daily: 'daily',
          history: 'history',
          stored: 'stored',
          url: 'entry',
        }[sceneSource])
    : null;
  const sceneBackdropSource = mediaSource(sceneArt ?? currentScene?.art_url ?? null);
  const hasSceneBackdrop = Boolean(sceneBackdropSource);
  const sceneActions = sceneActionsFor(sceneId);
  const canUseQuickAction = Boolean(sceneId) && !stream.isStreaming && remainingSeconds === 0;
  const canSend = !stream.isStreaming && remainingSeconds === 0 && draft.trim().length > 0;

  return (
    <WebAppShell
      contentMode="immersive"
      maxWidth="full"
      title={companion?.name ?? 'Chat'}
      subtitle={displaySceneName ? `${displaySceneName} · ${shownEmotion}` : `Chat · ${shownEmotion}`}
    >
      <View className="relative min-h-0 flex-1 overflow-hidden bg-[#2A2230]" style={twilightStyles.chatStage}>
        <SceneStageBackdrop
          label={displaySceneName ? `Scene: ${displaySceneName}` : 'Current scene'}
          source={sceneBackdropSource}
        />
        <View pointerEvents="none" style={hasSceneBackdrop ? twilightStyles.stageScrim : twilightStyles.emptyStageScrim} />

        <View className="relative z-10 mx-auto min-h-0 w-full max-w-[1280px] flex-1 flex-col justify-center xl:flex-row xl:items-stretch">
          <View className="relative min-h-[300px] min-w-0 overflow-hidden px-8 pb-8 pt-8 xl:flex-1">
            <View className="flex-row flex-wrap items-start justify-between gap-3">
              <View className="gap-1">
                <Text className="text-overline text-rose-soft">{displaySceneName ?? 'No scene selected'}</Text>
                <Text className="font-serif text-title text-white">{companion?.name ?? 'Companion'}</Text>
                <Text className="text-caption text-white/65">{companion?.relationship_role ?? 'companion'}</Text>
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <WebTag size="sm" variant="rose">{shownEmotion}</WebTag>
              </View>
            </View>

            <View pointerEvents="none" className="absolute inset-x-0 bottom-0 top-0 items-center justify-start pt-16 xl:items-end xl:pr-0">
              <View pointerEvents="none" style={twilightStyles.stageFloor} />
              {stageCompanion ? (
                <Image
                  accessibilityLabel={companion?.name ?? 'Companion'}
                  resizeMode="contain"
                  source={stageCompanion}
                  style={[twilightStyles.stageCompanion, hasSceneBackdrop ? twilightStyles.stageCompanionEntered : null]}
                />
              ) : portrait ? (
                <Image
                  accessibilityLabel={companion?.name ?? 'Companion portrait'}
                  resizeMode="contain"
                  source={portrait}
                  style={twilightStyles.stageCompanion}
                />
              ) : (
                <View className="mb-16 h-40 w-40 items-center justify-center rounded-full bg-white/10">
                  <Ionicons color="#F6C6D6" name="person-outline" size={46} />
                </View>
              )}
            </View>
          </View>

          <View
            className="relative z-20 flex min-h-0 w-full shrink-0 border-t border-white/20 shadow-float backdrop-blur xl:h-full xl:w-[520px] xl:flex-none xl:border-l xl:border-t-0"
            style={twilightStyles.chatPanel}
          >
            <View
              className="flex-row items-center justify-between border-b border-white/15 px-5 py-4"
              style={[twilightStyles.stickyHeader, twilightStyles.chatHeader]}
            >
              <View className="min-w-0 flex-row items-center gap-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={chatLanguage === 'zh' ? '返回' : 'Back'}
                  onPress={() => router.back()}
                  className="h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"
                >
                  <Ionicons color="rgba(255,255,255,0.75)" name="chevron-back" size={17} />
                </Pressable>
                <View className="min-w-0">
                  <Text className="font-serif text-title-sm text-white" numberOfLines={1}>{companion?.name ?? 'Companion'}</Text>
                  <Text className="text-caption text-white/60" numberOfLines={1}>
                    {stream.isStreaming
                      ? (chatLanguage === 'zh' ? '正在组织回复...' : 'Composing a reply...')
                      : remainingSeconds > 0
                        ? (chatLanguage === 'zh' ? `请稍等 ${remainingSeconds}s` : `Slow down — reply in ${remainingSeconds}s`)
                        : (chatLanguage === 'zh' ? '进入这个瞬间。' : 'Tap into the moment.')}
                  </Text>
                </View>
              </View>
              <View className="flex-row flex-wrap items-center justify-end gap-3">
                <View className="flex-row items-center overflow-hidden rounded-full border border-white/15 bg-app-sunken">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={autoVoice.enabled ? 'Turn off auto voice' : 'Turn on auto voice'}
                    onPress={autoVoice.toggle}
                    className={`min-h-9 flex-row items-center justify-center gap-2 px-3 transition-colors ${
                      autoVoice.enabled ? 'bg-app-rose-soft' : 'hover:bg-white/[0.075]'
                    }`}
                  >
                    <Ionicons
                      color={autoVoice.enabled ? '#FF8FAD' : 'rgba(255,255,255,0.65)'}
                      name={autoVoice.enabled ? 'volume-high' : 'volume-mute-outline'}
                      size={15}
                    />
                    <Text className="hidden text-caption font-semibold text-white sm:flex">
                      {autoVoice.enabled ? (chatLanguage === 'zh' ? '语音开' : 'Voice on') : (chatLanguage === 'zh' ? '语音关' : 'Voice off')}
                    </Text>
                  </Pressable>
                  <View className="h-5 w-px bg-app-line" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={chatLanguage === 'zh' ? '声音设置' : 'Voice settings'}
                    onPress={() => setVoiceDialogVisible(true)}
                    className={`h-9 w-9 items-center justify-center transition-colors ${
                      voiceDialogVisible ? 'bg-app-rose-soft' : 'hover:bg-white/[0.075]'
                    }`}
                  >
                    <Ionicons color={voiceDialogVisible ? '#FF8FAD' : 'rgba(255,255,255,0.65)'} name="settings-outline" size={15} />
                  </Pressable>
                </View>
                {pendingArrival ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setArrivalPrompt(pendingArrival)}
                    className="min-h-9 flex-row items-center justify-center gap-2 rounded-full border border-rose/40 bg-rose px-3"
                  >
                    <Ionicons color="#FFFFFF" name="navigate" size={14} />
                    <Text className="text-center text-caption font-semibold text-white">
                      {arrivalCopy.pendingLabel(pendingArrival.target.name)}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {inviteNotice ? (
              <View className="border-b border-white/5 bg-app-rose/15 px-5 py-2">
                <Text className="text-center text-caption font-semibold text-app-rose-deep">{inviteNotice}</Text>
              </View>
            ) : null}
            <View className="border-b border-white/10 px-5 py-3" style={twilightStyles.sceneStrip}>
              <Text className="text-caption text-white/55" numberOfLines={2}>
                {displaySceneName
                  ? (chatLanguage === 'zh'
                    ? `场景：${displaySceneName}${sceneSourceText ? ` · ${sceneSourceText}` : ''}`
                    : `Scene: ${displaySceneName}${sceneSourceText ? ` · ${sceneSourceText}` : ''}`)
                  : (chatLanguage === 'zh' ? `Intro. ${companion?.greeting ?? '开始一个私人对话。'}` : `Intro. ${companion?.greeting ?? 'Start a private conversation.'}`)}
              </Text>
            </View>
            <View className="absolute -right-[108px] top-20 z-30 hidden gap-2 xl:flex">
              <ChatRailButton
                icon="person-circle-outline"
                label={chatLanguage === 'zh' ? '资料' : 'Profile'}
                onPress={() => router.push(`/companion/${encodeURIComponent(companionId)}`)}
              />
              <ChatRailButton
                icon="shirt-outline"
                label={chatLanguage === 'zh' ? '形象' : 'Outfit'}
                onPress={() => setOutfitDialogVisible(true)}
              />
              <ChatRailButton
                icon="time-outline"
                label={chatLanguage === 'zh' ? '历史' : 'History'}
                onPress={() => {
                  if (history.hasMore) {
                    void handleLoadMore();
                  } else {
                    jumpToBottom();
                  }
                }}
              />
              <ChatRailButton
                icon="navigate-outline"
                label={chatLanguage === 'zh' ? '邀请' : 'Invite'}
                onPress={() => void openInvitePicker()}
              />
              {sceneId ? (
                <ChatRailButton
                  icon="sparkles-outline"
                  label={chatLanguage === 'zh' ? '动作' : 'Action'}
                  selected={actionMenuOpen}
                  onPress={() => setActionMenuOpen((open) => !open)}
                />
              ) : null}
              <ChatRailButton
                icon="options-outline"
                label={chatLanguage === 'zh' ? '人设' : 'Persona'}
                selected={toolsOpen}
                onPress={() => setToolsOpen((open) => !open)}
              />
            </View>
            {sceneId && actionMenuOpen ? (
              <View className="absolute -right-[286px] top-[340px] z-30 hidden w-64 xl:flex">
                <SceneActionMenu
                  actions={sceneActions}
                  canUseAction={canUseQuickAction}
                  customText={customActionText}
                  language={chatLanguage}
                  onChangeCustomText={setCustomActionText}
                  onClose={() => setActionMenuOpen(false)}
                  onSendCustom={() => void sendCustomSceneAction()}
                  onSelectAction={(action) => void sendSceneAction(action)}
                />
              </View>
            ) : null}
            {toolsOpen ? (
              <View className="gap-3 border-b border-white/10 px-4 py-3" style={twilightStyles.toolsPanel}>
                <View className="gap-2">
                  <View className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    <ChatRelationshipHud goal={relationship.goal} />
                  </View>
                  <View className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    <PersonaSelector personas={personas} selectedId={activePersonaId} onSelect={setSelectedPersonaId} />
                  </View>
                </View>
              </View>
            ) : null}
            <StoryActionBar
              disabled={stream.isStreaming || isResolvingStory}
              moment={storyMoment}
              onSelect={(choice) => {
                void handleStoryChoice(choice);
              }}
            />
            <ActivityContextBanner
              activity={activity}
              isMutating={activityActions.isMutating}
              onCancel={handleCancelActivity}
              onComplete={handleCompleteActivity}
            />
            <SignalFeedback signals={lastSignals} token={signalToken} />

            <View className="relative min-h-0 flex-1">
              <FlatList
                ref={threadScrollRef}
                data={items}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                contentContainerStyle={twilightStyles.threadContent}
                ListHeaderComponent={
                  history.hasMore ? (
                    <View className="items-center pb-4 pt-2">
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void handleLoadMore()}
                        className="items-center justify-center rounded-full border border-app-rose/30 bg-rose-300/12 px-5 py-2"
                      >
                        <Text className="text-center text-caption font-semibold text-rose-200">
                          {history.isLoadingMore ? 'Loading...' : 'Load earlier messages'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null
                }
                onContentSizeChange={handleContentSizeChange}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                style={twilightStyles.thread}
              />
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

            <View className="border-t border-white/15 px-5 py-4" style={twilightStyles.composerBar}>
              {sceneId ? (
                <View className="mb-3 gap-2 xl:hidden">
                  <QuickActionButton
                    icon="sparkles-outline"
                    label={chatLanguage === 'zh' ? '动作' : 'Action'}
                    onPress={() => setActionMenuOpen((open) => !open)}
                    selected={actionMenuOpen}
                  />
                  {actionMenuOpen ? (
                    <SceneActionMenu
                      actions={sceneActions}
                      canUseAction={canUseQuickAction}
                      customText={customActionText}
                      language={chatLanguage}
                      onChangeCustomText={setCustomActionText}
                      onClose={() => setActionMenuOpen(false)}
                      onSendCustom={() => void sendCustomSceneAction()}
                      onSelectAction={(action) => void sendSceneAction(action)}
                    />
                  ) : null}
                </View>
              ) : null}
              <View className="flex-row items-end gap-3">
                <View className="flex-1 rounded-2xl border border-white/15 bg-[#21142A] px-4 py-2.5 focus-within:border-rose/60">
                  <TextInput
                    multiline
                    onChangeText={setDraft}
                    onKeyPress={handleKeyPress}
                    placeholder={chatLanguage === 'zh' ? '写一条消息...' : 'Write a message...'}
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
                  <Text className="text-caption font-semibold text-ember">
                    {chatLanguage === 'zh' ? `请稍等 ${remainingSeconds}s 后再试` : `Slow down — try again in ${remainingSeconds}s`}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View pointerEvents="none" className="hidden min-w-0 xl:block xl:flex-1" />
        </View>
      </View>

      <WebInviteDialog
        companionName={companion?.name ?? 'them'}
        loading={inviteLoading}
        onClose={() => setInvitePickerVisible(false)}
        onSelect={handleInviteSelect}
        open={invitePickerVisible}
        targets={inviteTargets}
      />

      <WebEventDialog
        event={pendingEvents.current}
        isResolving={pendingEvents.isResolving}
        onClose={pendingEvents.close}
        onResolve={(event, optionId) => {
          void pendingEvents.resolve(event, optionId)
            .then((result) => {
              if (result.unlocks.length > 0) {
                enqueueCelebrations(result.unlocks);
              }
              if (result.level_changed) {
                enqueueCelebrations([{
                  key: `achievement:${result.level_changed}:${Date.now()}`,
                  kind: 'achievement',
                  label: result.level_changed,
                }]);
              }
              void relationship.refresh();
            })
            .catch((err) => pushError(err instanceof Error ? err.message : 'Event could not be resolved.'));
        }}
        open={pendingEvents.visible}
        result={pendingEvents.result}
      />

      <WebDialog
        onClose={() => setOutfitDialogVisible(false)}
        open={outfitDialogVisible}
        size="lg"
        title={chatLanguage === 'zh' ? '更换形象' : 'Change outfit'}
      >
        <ProfileOutfitPanel
          companionId={companionId}
          hasOverride={Boolean(companion?.profile_image_override)}
          name={companion?.name ?? 'Companion'}
          onChanged={async () => {
            setArtCutoutUrl(null);
            await refreshCompanionDetail();
            setOutfitDialogVisible(false);
          }}
          onError={pushError}
        />
      </WebDialog>

      <WebDialog
        description={chatLanguage === 'zh' ? '为这个角色选择你自己的聊天语音。首次生成每条回复的语音会消耗 credits，重复播放同一声音免费。' : 'Choose your own chat voice for this companion. The first voice generation for a reply costs credits; replaying the same voice is free.'}
        onClose={() => setVoiceDialogVisible(false)}
        open={voiceDialogVisible}
        size="lg"
        title={chatLanguage === 'zh' ? '声音设置' : 'Voice settings'}
      >
        <VoiceSettingsPanel
          initialGender={companion?.gender ?? null}
          initialValue={voiceSettings}
          isSaving={isSavingVoiceSettings}
          onSave={saveVoiceSettings}
        />
      </WebDialog>

      <WebDialog
        description={
          arrivalPrompt
            ? arrivalCopy.promptDescription(arrivalPrompt.target.name)
            : undefined
        }
        footer={
          arrivalPrompt ? (
            <View className="flex-row items-center justify-end gap-3">
              <WebButton
                label={arrivalCopy.later}
                onPress={() => setArrivalPrompt(null)}
                variant="ghost"
              />
              <WebButton
                label={arrivalCopy.arriveNow}
                onPress={() => {
                  void arriveAtPendingScene(arrivalPrompt);
                }}
                variant="primary"
              />
            </View>
          ) : null
        }
        onClose={() => setArrivalPrompt(null)}
        open={Boolean(arrivalPrompt)}
        size="sm"
        title={arrivalPrompt ? arrivalCopy.promptTitle(companion?.name ?? 'They', arrivalPrompt.target.name) : ''}
      />

      <WebUnlockCelebrationOverlay
        item={celebrationQueue[0] ?? null}
        language={chatLanguage}
        onClose={closeCelebration}
        onViewProfile={() => router.push(`/companion/${encodeURIComponent(companionId)}`)}
        onViewScene={(targetSceneId) => router.push(`/scene/${encodeURIComponent(targetSceneId)}`)}
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

function WebInviteDialog({
  companionName,
  loading,
  onClose,
  onSelect,
  open,
  targets,
}: {
  companionName: string;
  loading: boolean;
  onClose: () => void;
  onSelect: (target: InviteTarget) => void;
  open: boolean;
  targets: InviteTarget[];
}) {
  return (
    <WebDialog
      description="Pick a place to send an invitation now. They might say yes, or not."
      onClose={onClose}
      open={open}
      size="md"
      surface="solid"
      title={`Invite ${companionName} somewhere`}
    >
      {loading ? (
        <View className="items-center justify-center py-10">
          <ActivityIndicator color="#9A2F4F" />
        </View>
      ) : targets.length === 0 ? (
        <WebEmptyState
          description="Grow your relationship to unlock more places, then invite them from chat."
          icon="map-outline"
          title="No places yet"
        />
      ) : (
        <ScrollView style={{ maxHeight: 420 }}>
          <View className="gap-2">
            {targets.map((target) => {
              const thumb = mediaSource(target.art_url);
              return (
                <Pressable
                  key={target.id}
                  accessibilityRole="button"
                  onPress={() => onSelect(target)}
                  className="flex-row items-center gap-3 rounded-xl border border-app-line bg-app-sunken p-3 transition-colors hover:border-app-rose hover:bg-app-rose-soft active:bg-app-wine-soft"
                >
                  <SceneArtwork className="rounded-lg" fixedHeight={64} label={target.name} source={thumb} />
                  <View className="min-w-0 flex-1">
                    <Text className="text-base font-semibold text-white">{target.name}</Text>
                    <Text className="mt-1 text-body-sm leading-5 text-app-ink-soft" numberOfLines={2}>
                      {target.mood}
                    </Text>
                  </View>
                  <Ionicons color="#FF8FAD" name="arrow-forward" size={18} />
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </WebDialog>
  );
}

function WebEventDialog({
  event,
  isResolving,
  onClose,
  onResolve,
  open,
  result,
}: {
  event: EventResponseItem | null;
  isResolving: boolean;
  onClose: () => void;
  onResolve: (event: EventResponseItem, optionId: string) => void;
  open: boolean;
  result: EventResolveResponse | null;
}) {
  if (!event) return null;

  return (
    <WebDialog
      footer={
        <View className="flex-row items-center justify-end gap-3">
          <WebButton
            disabled={isResolving}
            isLoading={isResolving}
            label={result ? 'Done' : 'Later'}
            onPress={onClose}
            variant="ghost"
          />
        </View>
      }
      onClose={onClose}
      open={open}
      size="md"
      title={EVENT_TITLES[event.event_type]}
    >
      <Text className="text-base leading-7 text-white">{event.payload.description}</Text>

      {result ? (
        <View className="mt-5 rounded-2xl border border-app-rose/30 bg-[#21142A] p-4">
          <Text className="text-body-sm leading-6 text-white">{result.result.description}</Text>
          {result.level_changed ? (
            <Text className="mt-3 text-caption font-semibold uppercase text-rose-200">
              {`Relationship changed: ${result.level_changed}`}
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="mt-5 gap-2">
          {event.payload.options.map((option) => (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              disabled={isResolving}
              onPress={() => onResolve(event, option.id)}
              className={`min-h-12 justify-center rounded-xl border border-white/15 bg-[#21142A] px-4 py-3 transition-colors hover:border-app-rose/40 hover:bg-[#2A1934] ${
                isResolving ? 'opacity-50' : 'opacity-100'
              }`}
            >
              <Text className="text-sm font-semibold text-white">{option.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </WebDialog>
  );
}

function ChatScrollNotice({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View pointerEvents="box-none" className="absolute bottom-3 right-3 items-end">
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        className="min-h-8 flex-row items-center justify-center gap-1.5 rounded-full border border-rose-100/40 bg-rose-400/24 px-3 shadow-lg"
      >
        <Ionicons color="#fff7fb" name="arrow-down" size={13} />
        <Text className="text-center text-[11px] font-semibold text-rose-50">{label}</Text>
      </Pressable>
    </View>
  );
}

function ChatRailButton({
  icon,
  label,
  onPress,
  selected,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  const labelClass = label.length > 8 ? 'text-[9px] leading-[10px]' : 'text-[10px] leading-3';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`min-h-11 w-[96px] flex-row items-center justify-center gap-1.5 rounded-full border px-3 shadow-card ${
        selected ? 'border-rose/50' : 'border-white/20'
      }`}
      style={selected ? twilightStyles.railButtonSelected : twilightStyles.railButton}
    >
      <Ionicons color="rgba(255,255,255,0.76)" name={icon} size={15} />
      <Text className={`${labelClass} min-w-0 flex-1 text-center font-semibold text-white`} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
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
      className={`min-h-9 flex-row items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 ${
        selected ? 'border-rose/50 bg-[#6F2440]' : 'border-white/15 bg-[#2A1934]'
      } ${disabled ? 'opacity-50' : 'opacity-100'}`}
    >
      <Ionicons color="#F6C6D6" name={icon} size={15} />
      <Text className="text-center text-[11px] font-semibold leading-3 text-white" numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function SceneActionMenu({
  actions,
  canUseAction,
  customText,
  language,
  onChangeCustomText,
  onClose,
  onSelectAction,
  onSendCustom,
}: {
  actions: SceneAction[];
  canUseAction: boolean;
  customText: string;
  language: ChatLanguage;
  onChangeCustomText: (text: string) => void;
  onClose: () => void;
  onSelectAction: (action: SceneAction) => void;
  onSendCustom: () => void;
}) {
  const canSendCustom = canUseAction && customText.trim().length > 0;
  return (
    <View className="gap-3 rounded-2xl border border-white/20 p-3 shadow-float" style={twilightStyles.actionMenu}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-caption font-semibold uppercase text-white/60">
          {language === 'zh' ? '场景动作' : 'Scene actions'}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text className="text-[10px] font-semibold text-white/40">
            {`${customText.trim().length}/${CUSTOM_SCENE_ACTION_MAX_LENGTH}`}
          </Text>
          <Pressable
            accessibilityLabel={language === 'zh' ? '关闭动作菜单' : 'Close action menu'}
            accessibilityRole="button"
            onPress={onClose}
            className="h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-[#2A1934]"
          >
            <Ionicons color="rgba(255,255,255,0.78)" name="close" size={14} />
          </Pressable>
        </View>
      </View>

      {actions.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {actions.map((action) => {
            const label = sceneActionLabel(action, language);
            const labelClass = label.length > 8 ? 'text-[9px] leading-[10px]' : 'text-[10px] leading-3';
            return (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                disabled={!canUseAction}
                onPress={() => onSelectAction(action)}
                className={`min-h-10 w-[112px] flex-row items-center justify-center gap-1.5 rounded-full border border-white/20 px-2 shadow-card ${
                  canUseAction ? 'opacity-100' : 'opacity-40'
                }`}
                style={toneStyleForSceneAction(action)}
              >
                <Ionicons color="rgba(255,255,255,0.86)" name={iconForSceneAction(action)} size={14} />
                <Text className={`${labelClass} min-w-0 flex-1 text-center font-semibold text-white`} numberOfLines={2}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text className="text-caption text-white/55">
          {language === 'zh' ? '这个场景暂无预设动作。' : 'No preset actions for this scene yet.'}
        </Text>
      )}

      <View className="gap-2 border-t border-white/10 pt-3">
        <Text className="text-caption font-semibold text-white/70">
          {language === 'zh' ? '自定义动作' : 'Custom action'}
        </Text>
        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-1 rounded-xl border border-white/15 bg-[#21142A] px-3 py-2">
            <TextInput
              maxLength={CUSTOM_SCENE_ACTION_MAX_LENGTH}
              onChangeText={onChangeCustomText}
              placeholder={language === 'zh' ? '输入刚刚发生的动作...' : 'Describe what you do...'}
              placeholderTextColor="rgba(255,255,255,0.38)"
              value={customText}
              className="min-h-8 text-body-sm text-white outline-none"
            />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!canSendCustom}
            onPress={onSendCustom}
            className={`h-10 w-10 items-center justify-center rounded-xl ${canSendCustom ? 'bg-rose' : 'bg-[#2A1934]'}`}
          >
            <Ionicons color={canSendCustom ? '#FFFFFF' : 'rgba(255,255,255,0.35)'} name="send" size={15} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function iconForSceneAction(action: SceneAction): keyof typeof Ionicons.glyphMap {
  switch (action.tone) {
    case 'negative':
      return 'alert-circle-outline';
    case 'awkward':
      return 'help-circle-outline';
    case 'intimate':
    case 'romantic':
      return 'heart-outline';
    case 'positive':
      return 'sparkles-outline';
    case 'neutral':
      return 'ellipse-outline';
  }
}

function toneStyleForSceneAction(action: SceneAction): ViewStyle {
  switch (action.tone) {
    case 'negative':
      return twilightStyles.negativeActionButton;
    case 'awkward':
      return twilightStyles.awkwardActionButton;
    case 'intimate':
    case 'romantic':
      return twilightStyles.romanticActionButton;
    case 'positive':
      return twilightStyles.positiveActionButton;
    case 'neutral':
      return twilightStyles.neutralActionButton;
  }
}

const twilightStyles = StyleSheet.create({
  // `position: sticky` is a web-only value react-native-web understands but the
  // RN style types don't list — pin the header to the top of the page scroll.
  stickyHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
  } as unknown as ViewStyle,
  chatStage: {
    height: '100%',
    minHeight: 0,
  } as unknown as ViewStyle,
  chatPanel: {
    backgroundColor: 'rgba(58, 49, 68, 0.94)',
  } as unknown as ViewStyle,
  chatHeader: {
    backgroundColor: 'rgba(47, 40, 56, 0.72)',
  } as unknown as ViewStyle,
  sceneStrip: {
    backgroundColor: 'rgba(47, 40, 56, 0.46)',
  } as unknown as ViewStyle,
  toolsPanel: {
    backgroundColor: 'rgba(19, 10, 24, 0.96)',
  } as unknown as ViewStyle,
  composerBar: {
    backgroundColor: 'rgba(47, 40, 56, 0.92)',
  } as unknown as ViewStyle,
  railButton: {
    backgroundColor: 'rgba(35, 21, 43, 0.92)',
  } as unknown as ViewStyle,
  railButtonSelected: {
    backgroundColor: 'rgba(154, 47, 79, 0.88)',
  } as unknown as ViewStyle,
  actionMenu: {
    backgroundColor: 'rgba(19, 10, 24, 0.98)',
  } as unknown as ViewStyle,
  awkwardActionButton: {
    backgroundColor: 'rgba(126, 94, 58, 0.76)',
  } as unknown as ViewStyle,
  negativeActionButton: {
    backgroundColor: 'rgba(107, 45, 52, 0.82)',
  } as unknown as ViewStyle,
  neutralActionButton: {
    backgroundColor: 'rgba(42, 25, 52, 0.94)',
  } as unknown as ViewStyle,
  positiveActionButton: {
    backgroundColor: 'rgba(62, 93, 82, 0.78)',
  } as unknown as ViewStyle,
  romanticActionButton: {
    backgroundColor: 'rgba(151, 58, 94, 0.78)',
  } as unknown as ViewStyle,
  stageScrim: {
    backgroundColor: 'rgba(64,45,68,0.12)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  emptyStageScrim: {
    backgroundColor: 'rgba(255,235,242,0.06)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  stageFloor: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    top: 430,
    height: 58,
    position: 'absolute',
    width: 300,
  },
  stageCompanion: {
    height: '62%',
    maxHeight: 480,
    maxWidth: 360,
    minHeight: 300,
    transform: [{ translateY: -8 }],
    width: '72%',
  },
  stageCompanionEntered: {
    opacity: 1,
    transitionDuration: '360ms',
    transitionProperty: 'opacity, transform',
  } as unknown as ImageStyle,
  thread: {
    flexGrow: 1,
    minHeight: 0,
  },
  threadContent: {
    gap: 12,
    paddingBottom: 24,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
});
