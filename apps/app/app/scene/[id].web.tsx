import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';

import {
  createSceneStory,
  inviteCompanionToSceneStory,
  mediaSource,
  updateSceneStory,
} from '@/api/companion-client';
import type { SceneStory, SceneStoryInput, SceneStoryInviteCompanion, SceneStoryInviteResponse } from '@/api/types';
import { EventPopup } from '@/components/EventPopup';
import { SceneArtwork } from '@/components/SceneArtwork';
import { SceneStoryEditor } from '@/components/SceneStoryEditor';
import { WebAppShell } from '@/components/web/WebAppShell';
import {
  WebButton,
  WebCard,
  WebDialog,
  WebEmptyState,
  WebLoading,
  WebTag,
} from '@/components/web/ui';
import { SCENES_ROUTE } from '@/constants/routes';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { usePendingEvents } from '@/hooks/use-pending-events';
import { useSceneEntry, useSceneStories, useSceneStoryInviteCompanions } from '@/hooks/use-scenes';

export default function WebSceneDetailScreen() {
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
    return <WebLoading label="Stepping inside..." />;
  }

  if (error || !data) {
    return (
      <WebAppShell
        title="Scene"
        subtitle="This scene could not be opened."
        breadcrumbs={[{ href: SCENES_ROUTE, label: 'Scenes' }]}
      >
        <WebEmptyState
          actionLabel="Try again"
          description="The scene could not be opened."
          onAction={refetch}
          title="Scene unavailable"
        />
      </WebAppShell>
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
      if (editingStory) {
        await updateSceneStory(scene.id, editingStory.id, input);
      } else {
        await createSceneStory(scene.id, input);
      }
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
    <WebAppShell
      title={scene.name}
      subtitle={scene.mood}
      breadcrumbs={[{ href: SCENES_ROUTE, label: 'Scenes' }, { label: scene.name }]}
    >
      <View className="mb-7 flex-row flex-wrap items-start justify-between gap-4">
        <View className="min-w-0 flex-1">
          <Text className="font-serif text-display-sm text-white">{scene.name}</Text>
          <Text className="mt-2 max-w-2xl text-body-sm leading-6 text-rose-50/60">{scene.mood}</Text>
        </View>
        <WebButton label="Create story" onPress={() => openEditor()} variant="primary" />
      </View>

      <View className="grid grid-cols-1 gap-8 xl:grid-cols-[1.35fr_0.9fr]">
        <WebCard padding="none" className="overflow-hidden">
          <SceneArtwork label={scene.name} source={imageSource} />
          <View className="gap-4 p-6">
            <Text className="text-overline text-app-rose-deep">Scene</Text>
            <Text className="font-serif text-title text-white">Choose a story that happens here.</Text>
            {scene.tags.length ? (
              <View className="flex-row flex-wrap gap-1.5">
                {scene.tags.map((tag) => (
                  <WebTag key={tag} size="sm" variant="rose">
                    {tag}
                  </WebTag>
                ))}
              </View>
            ) : null}
          </View>
        </WebCard>

        <WebCard padding="lg" className="gap-4">
          <View>
            <Text className="text-overline text-app-rose-deep">Stories</Text>
            <Text className="mt-1 font-serif text-title text-white">Pick a story, then invite a companion.</Text>
          </View>
          <Text className="text-body-sm leading-6 text-rose-50/70">
            Story mode uses the selected scene, story, and current task to guide the chat. If a companion refuses,
            no chat starts.
          </Text>
        </WebCard>
      </View>

      <View className="mt-10 gap-5">
        <View className="flex-row flex-wrap items-end justify-between gap-3">
          <View>
            <Text className="text-overline text-app-rose-deep">Scene stories</Text>
            <Text className="mt-1 font-serif text-title text-white">Available here</Text>
          </View>
          <WebButton label="Create story" onPress={() => openEditor()} size="sm" variant="secondary" />
        </View>

        {storiesState.isLoading ? (
          <WebLoading fullscreen={false} label="Loading stories..." />
        ) : storiesState.error ? (
          <WebEmptyState
            actionLabel="Try again"
            description="Stories for this scene could not be loaded."
            onAction={storiesState.refetch}
            title="Stories unavailable"
          />
        ) : stories.length === 0 ? (
          <WebEmptyState
            actionLabel="Create story"
            description="No stories have been written for this scene yet."
            onAction={() => openEditor()}
            title="No stories here yet"
          />
        ) : (
          <View className="grid grid-cols-1 gap-5 lg:grid-cols-2">
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

      <WebDialog
        description="Write a scene-owned story and the tasks the AI should use to guide the chat."
        onClose={() => {
          setEditorOpen(false);
          setEditingStory(null);
        }}
        open={editorOpen}
        size="lg"
        title={editingStory ? 'Edit story' : 'Create story'}
      >
        <SceneStoryEditor
          initialStory={editingStory}
          isSaving={savingStory}
          onCancel={() => {
            setEditorOpen(false);
            setEditingStory(null);
          }}
          onSave={(input) => void saveStory(input)}
        />
      </WebDialog>

      <WebStoryInviteDialog
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
    </WebAppShell>
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
    <WebCard padding="lg" className="gap-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-overline text-app-rose-deep">
            {story.source_type === 'official_preset' ? 'Official story' : 'Your story'}
          </Text>
          <Text className="mt-1 font-serif text-title-sm text-white">{story.title}</Text>
        </View>
        <View className="rounded-full border border-white/10 bg-app-solid-sunken px-3 py-1">
          <Text className="text-caption font-semibold text-white">{story.progress_percent}%</Text>
        </View>
      </View>
      {story.synopsis ? (
        <Text className="text-body-sm leading-6 text-rose-50/75">{story.synopsis}</Text>
      ) : null}
      {story.current_task ? (
        <View className="rounded-xl border border-app-line bg-app-solid-sunken p-4">
          <Text className="text-caption font-semibold uppercase tracking-normal text-rose-50/55">Current task</Text>
          <Text className="mt-1 text-body-sm font-semibold text-white">{story.current_task.title}</Text>
          <Text className="mt-1 text-body-sm leading-6 text-rose-50/70">{story.current_task.objective}</Text>
        </View>
      ) : (
        <Text className="text-body-sm text-rose-50/60">All tasks are complete.</Text>
      )}
      <View className="flex-row flex-wrap justify-end gap-3">
        {onEdit ? <WebButton label="Edit" onPress={onEdit} size="sm" variant="ghost" /> : null}
        <WebButton
          disabled={!story.current_task}
          label={story.progress_percent > 0 ? 'Continue story' : 'Start story'}
          onPress={onStart}
          size="sm"
          variant="primary"
        />
      </View>
    </WebCard>
  );
}

function WebStoryInviteDialog({
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
    <WebDialog
      description={story ? 'Pick a companion to invite into this story. They can accept or refuse.' : undefined}
      onClose={onClose}
      open={Boolean(story)}
      size="lg"
      title={story ? `Invite to ${story.title}` : 'Invite companion'}
    >
      {result ? (
        <View className={`mb-4 rounded-xl border p-4 ${result.accepted ? 'border-app-success/30 bg-app-success/10' : 'border-app-ember/30 bg-app-ember-soft'}`}>
          <Text className="text-body-sm font-semibold text-white">{result.accepted ? 'Accepted' : 'Refused'}</Text>
          <Text className="mt-1 text-body-sm leading-6 text-rose-50/75">{result.reply || result.reason}</Text>
        </View>
      ) : null}
      {isLoading ? (
        <View className="items-center justify-center py-10">
          <ActivityIndicator color="#FF8FAD" />
        </View>
      ) : companions.length === 0 ? (
        <WebEmptyState
          description="No available companion with an image can join this story yet."
          icon="person-outline"
          title="No companions available"
        />
      ) : (
        <ScrollView style={{ maxHeight: 440 }}>
          <View className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {companions.map((companion) => {
              const imageSource = mediaSource(companion.art_url);
              return (
                <Pressable
                  key={companion.id}
                  accessibilityRole="button"
                  disabled={Boolean(invitingId)}
                  onPress={() => onInvite(companion)}
                  className="flex-row items-center gap-3 rounded-xl border border-app-line bg-app-solid-sunken p-3 transition-colors hover:border-app-rose"
                >
                  <View className="h-16 w-12 items-center justify-end overflow-hidden rounded-lg bg-black/30">
                    {imageSource ? (
                      <Image source={imageSource} resizeMode="contain" style={{ height: '100%', width: '100%' }} />
                    ) : (
                      <Text className="font-serif text-title-sm text-app-rose-deep">{companion.name.slice(0, 1)}</Text>
                    )}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-body-sm font-semibold text-white" numberOfLines={1}>{companion.name}</Text>
                    <Text className="mt-1 text-caption text-rose-50/60" numberOfLines={1}>
                      {companion.relationship_role ?? companion.source}
                    </Text>
                  </View>
                  {invitingId === companion.id ? (
                    <ActivityIndicator color="#FF8FAD" size="small" />
                  ) : (
                    <Ionicons color="#FF8FAD" name="arrow-forward" size={17} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
    </WebDialog>
  );
}
