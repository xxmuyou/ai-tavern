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
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';

import { clearChatHistory, getCompanion } from '@/api/companion-client';
import type {
  ChatEmotionKey,
  ChatMessage,
  ChatMomentImage,
  ChatOutfitImage,
  ChatUnlock,
  RelationshipDimensions,
} from '@/api/types';
import { ActivityContextBanner } from '@/components/ActivityContextBanner';
import { AuthGuard } from '@/components/AuthGuard';
import { Button } from '@/components/Button';
import { ChatRelationshipHud } from '@/components/ChatRelationshipHud';
import { CompanionStoryPanel } from '@/components/CompanionStoryPanel';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { MessageBubble } from '@/components/MessageBubble';
import { MomentImageCapture } from '@/components/MomentImageCapture';
import { OutfitImageCapture } from '@/components/OutfitImageCapture';
import { PortraitBar } from '@/components/PortraitBar';
import { SignalFeedback } from '@/components/SignalFeedback';
import { StreamingBubble } from '@/components/StreamingBubble';
import { TopBar } from '@/components/TopBar';
import { UnlockCelebration } from '@/components/UnlockCelebration';
import { ApiError, QuotaExceededError, RateLimitedError } from '@/hooks/use-api';
import { useActivities, useActivity } from '@/hooks/use-activities';
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

const BILLING_ROUTE = '/billing' as Href;
const STREAMING_ID = '__streaming__';

type StreamingItem = {
  __streaming: true;
  id: typeof STREAMING_ID;
  text: string;
};

type CompanionPortraitState = {
  art_emotions: Partial<Record<ChatEmotionKey, string>> | null;
  art_url: string | null;
  name: string;
};

type ChatListItem = ChatMessage | StreamingItem;

function isStreamingItem(item: ChatListItem): item is StreamingItem {
  return (item as StreamingItem).__streaming === true;
}

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
  const sceneId = typeof params.sceneId === 'string' ? params.sceneId : undefined;
  const sceneArt = typeof params.sceneArt === 'string' && params.sceneArt.length > 0 ? params.sceneArt : null;
  const router = useRouter();
  const { pushError } = useErrorBanner();

  const [companion, setCompanion] = useState<CompanionPortraitState>({
    art_emotions: null,
    art_url: null,
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

  const listRef = useRef<FlatList<ChatListItem>>(null);
  const shouldScrollOnNextRef = useRef(true);

  const history = useChatHistory(companionId);
  const stream = useChatStream(companionId);
  const relationship = useChatRelationship(companionId);
  const personasState = usePersonas();
  const personas = personasState.data?.personas ?? [];
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const activePersonaId =
    selectedPersonaId ?? personas.find((p) => p.is_default)?.id ?? personas[0]?.id ?? null;
  const messageActions = useMessageActions(companionId, history, pushError);
  const editMessage = useEditMessage(companionId, history, {
    onError: pushError,
    onSaved: () => {
      shouldScrollOnNextRef.current = true;
      void relationship.refresh();
    },
  });
  const activityState = useActivity(activityId);
  const activityActions = useActivities();
  const { activity, refresh: refreshActivity, setActivity } = activityState;

  useEffect(() => {
    void refreshActivity();
  }, [refreshActivity]);

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
            name: detail.name ?? 'Chat',
          });
        }
      } catch {
        if (!cancelled) {
          setCompanion({ art_emotions: null, art_url: null, name: 'Chat' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
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

  useEffect(() => {
    if (!history.isLoadingInitial && history.messages.length > 0) {
      shouldScrollOnNextRef.current = true;
    }
  }, [history.isLoadingInitial, history.messages.length]);

  const items = useMemo<ChatListItem[]>(() => {
    if (!stream.isStreaming) {
      return history.messages;
    }
    const placeholder: StreamingItem = {
      __streaming: true,
      id: STREAMING_ID,
      text: stream.streamingText,
    };
    return [...history.messages, placeholder];
  }, [history.messages, stream.isStreaming, stream.streamingText]);

  const handleContentSizeChange = useCallback(() => {
    if (shouldScrollOnNextRef.current && listRef.current) {
      listRef.current.scrollToEnd({ animated: false });
      shouldScrollOnNextRef.current = false;
    }
  }, []);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || stream.isStreaming) {
      return;
    }
    if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
      return;
    }
    const userMessage: ChatMessage = {
      companion_id: companionId,
      content: text,
      created_at: new Date().toISOString(),
      id: `local-user-${Date.now()}`,
      role: 'user',
    };
    history.appendMessage(userMessage);
    setDraft('');
    shouldScrollOnNextRef.current = true;

    let serverMessageId = '';
    try {
      const result = await stream.send(text, {
        activityId,
        personaId: activePersonaId ?? undefined,
        onDone: (info) => {
          serverMessageId = info.messageId;
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
      const finalMessage: ChatMessage = {
        companion_id: companionId,
        content: result.text,
        created_at: new Date().toISOString(),
        emotion: result.emotion,
        id: serverMessageId || `local-companion-${Date.now()}`,
        role: 'companion',
        scene_id: sceneId ?? null,
      };
      history.appendMessage(finalMessage);
      shouldScrollOnNextRef.current = true;
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
    }
  }, [activePersonaId, activityId, companionId, draft, history, pushError, rateLimitedUntil, relationship, sceneId, stream]);

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
    updateHistoryMessage(messageId, (message) => ({ ...message, moment_image: moment }));
    shouldScrollOnNextRef.current = true;
  }, [updateHistoryMessage]);
  const handleOutfitReady = useCallback((messageId: string, outfit: ChatOutfitImage) => {
    updateHistoryMessage(messageId, (message) => ({ ...message, outfit_image: outfit }));
    shouldScrollOnNextRef.current = true;
  }, [updateHistoryMessage]);

  const renderItem = useCallback(({ item }: { item: ChatListItem }) => {
    if (isStreamingItem(item)) {
      return <StreamingBubble text={item.text} />;
    }
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
        {isServerCompanion ? (
          <OutfitImageCapture
            messageId={item.id}
            initialOutfit={item.outfit_image ?? null}
            onOutfitReady={(outfit) => handleOutfitReady(item.id, outfit)}
          />
        ) : null}
      </View>
    );
  }, [editMessage, handleMomentReady, handleOutfitReady, messageActions]);

  const keyExtractor = useCallback((item: ChatListItem) => item.id, []);

  const remainingSeconds = useMemo(() => {
    if (!rateLimitedUntil) {
      return 0;
    }
    return Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000));
  }, [now, rateLimitedUntil]);

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

  const sendDisabled = stream.isStreaming || remainingSeconds > 0 || draft.trim().length === 0;

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar
        showBack
        title={companion.name}
        right={
          <Pressable
            accessibilityLabel="Clear conversation"
            accessibilityRole="button"
            onPress={() => setClearConfirmVisible(true)}
            className="h-10 w-10 items-center justify-center rounded-lg"
          >
            <Ionicons color="#11181C" name="trash-outline" size={20} />
          </Pressable>
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

      <UnlockCelebration unlocks={lastUnlocks} token={unlockToken} />

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
            ListHeaderComponent={
              history.hasMore ? (
                <View className="items-center px-4 py-3">
                  <Pressable
                    accessibilityRole="button"
                    disabled={history.isLoadingMore}
                    onPress={() => void history.loadMore()}
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

        {remainingSeconds > 0 ? (
          <View className="border-t border-app-line bg-app-warning/10 px-4 py-2">
            <Text className="text-center text-sm font-medium text-app-warning">
              {`Slow down — try again in ${remainingSeconds}s`}
            </Text>
          </View>
        ) : null}

        <View className="border-t border-app-line bg-app-card px-3 py-3">
          <View className="flex-row items-end gap-2">
            <TextInput
              accessibilityLabel="Message input"
              editable={!stream.isStreaming}
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

      <Modal
        animationType="fade"
        onRequestClose={() => setQuotaModalVisible(false)}
        transparent
        visible={quotaModalVisible}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-6">
          <View className="w-full max-w-sm rounded-2xl bg-app-card p-6">
            <Text className="text-xl font-semibold text-app-text">Daily limit reached</Text>
            <Text className="mt-3 text-sm leading-5 text-app-muted">
              You have used all of today&apos;s free messages. Upgrade to Pro for unlimited conversations.
            </Text>
            <View className="mt-5 gap-2">
              <Button
                label="Upgrade to Pro"
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
