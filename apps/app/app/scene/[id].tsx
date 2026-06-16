import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import {
  createSceneStory,
  inviteCompanionToSceneStory,
  mediaSource,
  updateSceneStory,
} from '@/api/companion-client';
import type { SceneStory, SceneStoryInput, SceneStoryInviteCompanion, SceneStoryInviteResponse } from '@/api/types';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { EventPopup } from '@/components/EventPopup';
import { LoadingScreen } from '@/components/LoadingScreen';
import { SceneArtwork } from '@/components/SceneArtwork';
import { SceneStoryEditor } from '@/components/SceneStoryEditor';
import { TopBar } from '@/components/TopBar';
import { SCENES_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { usePendingEvents } from '@/hooks/use-pending-events';
import { useSceneEntry, useSceneStories, useSceneStoryInviteCompanions } from '@/hooks/use-scenes';

export default function SceneDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sceneId = Array.isArray(id) ? id[0] : id;
  const { pushError } = useErrorBanner();
  const { data, error, isLoading, refetch } = useSceneEntry(sceneId);
  const storiesState = useSceneStories(sceneId);
  const pendingEvents = usePendingEvents(data?.event ?? null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<SceneStory | null>(null);
  const [savingStory, setSavingStory] = useState(false);
  const [inviteStory, setInviteStory] = useState<SceneStory | null>(null);
  const inviteCompanions = useSceneStoryInviteCompanions(sceneId, { enabled: Boolean(inviteStory) });
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<SceneStoryInviteResponse | null>(null);

  useEffect(() => {
    const status = (error as Error & { status?: number } | null)?.status;
    if (status === 403) {
      pushError('This scene is still locked.');
      router.replace(SCENES_ROUTE);
    }
  }, [error, pushError, router]);

  if (isLoading) {
    return <LoadingScreen label="Entering scene..." />;
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Scene" />
        <EmptyState
          actionLabel="Try again"
          description="The scene could not be opened."
          onAction={refetch}
          title="Scene unavailable"
        />
      </View>
    );
  }

  const scene = data.scene;
  const imageSource = mediaSource(scene.art_url);
  const stories = storiesState.data?.stories ?? [];

  function openEditor(story: SceneStory | null = null) {
    setEditingStory(story);
    setEditorOpen(true);
  }

  async function saveStory(input: SceneStoryInput) {
    setSavingStory(true);
    try {
      if (editingStory) await updateSceneStory(scene.id, editingStory.id, input);
      else await createSceneStory(scene.id, input);
      await storiesState.refetch();
      setEditorOpen(false);
      setEditingStory(null);
    } catch (err) {
      pushError(err instanceof Error ? err.message : 'Story could not be saved.');
    } finally {
      setSavingStory(false);
    }
  }

  function startInvite(story: SceneStory) {
    if (!story.current_task) {
      pushError('This story has no active task yet.');
      return;
    }
    setInviteResult(null);
    setInviteStory(story);
  }

  async function inviteCompanion(companion: SceneStoryInviteCompanion) {
    if (!inviteStory || invitingId) return;
    setInvitingId(companion.id);
    setInviteResult(null);
    try {
      const result = await inviteCompanionToSceneStory(scene.id, inviteStory.id, companion.id);
      setInviteResult(result);
      if (result.accepted && result.chat) {
        const params = new URLSearchParams({
          chatMode: 'story',
          sceneId: scene.id,
          storyId: inviteStory.id,
        });
        if (scene.art_url) params.set('sceneArt', scene.art_url);
        globalThis.setTimeout(() => {
          router.push(`/chat/${encodeURIComponent(companion.id)}?${params.toString()}` as Href);
        }, 700);
      }
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      pushError(status === 402 ? 'Not enough credits to send this story invite.' : err instanceof Error ? err.message : 'Story invite failed.');
    } finally {
      setInvitingId(null);
    }
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showBack showQuota title={scene.name} />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-4xl gap-5 px-4 py-6">
          <View className="overflow-hidden rounded-lg border border-app-line bg-app-card">
            <SceneArtwork fallbackLabel="Scene artwork pending" label={scene.name} source={imageSource} />
            <View className="gap-3 p-5">
              <Text className="text-3xl font-semibold text-app-text">{scene.name}</Text>
              <Text className="text-base leading-6 text-app-muted">{scene.mood}</Text>
              {scene.tags.length ? (
                <View className="flex-row flex-wrap gap-2">
                  {scene.tags.map((tag) => (
                    <View key={tag} className="rounded-full bg-app-primarySoft px-3 py-1">
                      <Text className="text-xs font-semibold text-app-primary">{tag}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-lg font-semibold text-app-text">Stories here</Text>
              <Text className="text-sm leading-5 text-app-muted">Choose a story, then invite a companion.</Text>
            </View>
            <Button label="Create story" onPress={() => openEditor()} />
          </View>

          {storiesState.isLoading ? (
            <LoadingScreen label="Loading stories..." />
          ) : storiesState.error ? (
            <EmptyState
              actionLabel="Try again"
              description="Stories for this scene could not be loaded."
              onAction={storiesState.refetch}
              title="Stories unavailable"
            />
          ) : stories.length === 0 ? (
            <View className="rounded-lg border border-app-line bg-app-card p-5">
              <Text className="text-lg font-semibold text-app-text">No stories here yet</Text>
              <Text className="mt-1 text-sm leading-5 text-app-muted">Create a story that belongs to this scene.</Text>
              <View className="mt-4">
                <Button label="Create story" onPress={() => openEditor()} />
              </View>
            </View>
          ) : (
            <View className="gap-4">
              {stories.map((story) => (
                <SceneStoryCard
                  key={story.id}
                  onEdit={story.can_edit ? () => openEditor(story) : undefined}
                  onStart={() => startInvite(story)}
                  story={story}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <StoryEditorModal
        initialStory={editingStory}
        isSaving={savingStory}
        onClose={() => {
          setEditorOpen(false);
          setEditingStory(null);
        }}
        onSave={(input) => void saveStory(input)}
        visible={editorOpen}
      />
      <StoryInviteModal
        companions={inviteCompanions.data?.companions ?? []}
        isLoading={inviteCompanions.isLoading}
        invitingId={invitingId}
        onClose={() => {
          setInviteStory(null);
          setInviteResult(null);
        }}
        onInvite={(companion) => void inviteCompanion(companion)}
        result={inviteResult}
        story={inviteStory}
      />
      <EventPopup
        event={pendingEvents.current}
        isResolving={pendingEvents.isResolving}
        result={pendingEvents.result}
        visible={pendingEvents.visible}
        onClose={pendingEvents.close}
        onResolve={(event, optionId) => {
          void pendingEvents.resolve(event, optionId).catch((err) => {
            pushError(err instanceof Error ? err.message : 'Event could not be resolved.');
          });
        }}
      />
    </View>
  );
}

function SceneStoryCard({
  onEdit,
  onStart,
  story,
}: {
  onEdit?: () => void;
  onStart: () => void;
  story: SceneStory;
}) {
  return (
    <View className="gap-3 rounded-lg border border-app-line bg-app-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-semibold uppercase text-app-primary">
            {story.source_type === 'official_preset' ? 'Official story' : 'Your story'}
          </Text>
          <Text className="mt-1 text-lg font-semibold text-app-text">{story.title}</Text>
        </View>
        <View className="rounded-full bg-app-primarySoft px-3 py-1">
          <Text className="text-xs font-semibold text-app-primary">{story.progress_percent}%</Text>
        </View>
      </View>
      {story.synopsis ? <Text className="text-sm leading-5 text-app-muted">{story.synopsis}</Text> : null}
      {story.current_task ? (
        <View className="rounded-lg border border-app-line bg-app-bg p-3">
          <Text className="text-xs font-semibold uppercase text-app-muted">Current task</Text>
          <Text className="mt-1 text-sm font-semibold text-app-text">{story.current_task.title}</Text>
          <Text className="mt-1 text-sm leading-5 text-app-muted">{story.current_task.objective}</Text>
        </View>
      ) : (
        <Text className="text-sm text-app-muted">All tasks are complete.</Text>
      )}
      <View className="gap-2">
        <Button disabled={!story.current_task} label={story.progress_percent > 0 ? 'Continue story' : 'Start story'} onPress={onStart} />
        {onEdit ? <Button label="Edit" onPress={onEdit} variant="secondary" /> : null}
      </View>
    </View>
  );
}

function StoryEditorModal({
  initialStory,
  isSaving,
  onClose,
  onSave,
  visible,
}: {
  initialStory: SceneStory | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (input: SceneStoryInput) => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 bg-black/45 px-4 py-8">
        <View className="max-h-full rounded-2xl bg-app-card">
          <View className="flex-row items-center justify-between border-b border-app-line px-5 py-4">
            <Text className="text-xl font-semibold text-app-text">{initialStory ? 'Edit story' : 'Create story'}</Text>
            <Pressable accessibilityRole="button" onPress={onClose} className="h-10 w-10 items-center justify-center rounded-lg">
              <Ionicons color="#687076" name="close" size={20} />
            </Pressable>
          </View>
          <ScrollView className="px-5 py-5" keyboardShouldPersistTaps="handled">
            <SceneStoryEditor
              initialStory={initialStory}
              isSaving={isSaving}
              onCancel={onClose}
              onSave={onSave}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function StoryInviteModal({
  companions,
  isLoading,
  invitingId,
  onClose,
  onInvite,
  result,
  story,
}: {
  companions: SceneStoryInviteCompanion[];
  isLoading: boolean;
  invitingId: string | null;
  onClose: () => void;
  onInvite: (companion: SceneStoryInviteCompanion) => void;
  result: SceneStoryInviteResponse | null;
  story: SceneStory | null;
}) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={Boolean(story)}>
      <View className="flex-1 bg-black/45 px-4 py-8">
        <View className="max-h-full rounded-2xl bg-app-card">
          <View className="flex-row items-center justify-between border-b border-app-line px-5 py-4">
            <View className="min-w-0 flex-1">
              <Text className="text-xl font-semibold text-app-text">Invite companion</Text>
              <Text className="mt-1 text-sm text-app-muted" numberOfLines={1}>{story?.title}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} className="h-10 w-10 items-center justify-center rounded-lg">
              <Ionicons color="#687076" name="close" size={20} />
            </Pressable>
          </View>
          <ScrollView className="px-5 py-5">
            {result ? (
              <View className="mb-4 rounded-lg border border-app-line bg-app-bg p-4">
                <Text className="text-base font-semibold text-app-text">{result.accepted ? 'Accepted' : 'Refused'}</Text>
                <Text className="mt-1 text-sm leading-5 text-app-muted">{result.reply || result.reason}</Text>
              </View>
            ) : null}
            {isLoading ? (
              <View className="items-center py-8">
                <ActivityIndicator color="#1E6B52" />
              </View>
            ) : companions.length === 0 ? (
              <Text className="text-sm leading-5 text-app-muted">No available companion with an image can join this story yet.</Text>
            ) : (
              <View className="gap-3">
                {companions.map((companion) => {
                  const source = mediaSource(companion.art_url);
                  return (
                    <Pressable
                      key={companion.id}
                      accessibilityRole="button"
                      disabled={Boolean(invitingId)}
                      onPress={() => onInvite(companion)}
                      className="flex-row items-center gap-3 rounded-lg border border-app-line bg-app-bg p-3"
                    >
                      <View className="h-16 w-12 items-center justify-end overflow-hidden rounded-lg bg-app-primarySoft">
                        {source ? (
                          <Image source={source} resizeMode="contain" style={{ height: '100%', width: '100%' }} />
                        ) : (
                          <Text className="text-xl font-semibold text-app-primary">{companion.name.slice(0, 1)}</Text>
                        )}
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="text-base font-semibold text-app-text" numberOfLines={1}>{companion.name}</Text>
                        <Text className="text-sm text-app-muted" numberOfLines={1}>{companion.relationship_role ?? companion.source}</Text>
                      </View>
                      {invitingId === companion.id ? <ActivityIndicator color="#1E6B52" /> : <Ionicons color="#1E6B52" name="arrow-forward" size={18} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
