import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { deleteCompanion, favoriteCompanion, mediaSource, setCompanionPublic } from '@/api/companion-client';
import { CompanionArtwork } from '@/components/CompanionArtwork';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebCard, WebDialog, WebEmptyState, WebLoading, WebPanel, WebTabs, WebTag } from '@/components/web/ui';
import { CompanionGalleryPanel } from '@/components/CompanionGalleryPanel';
import { CompanionMemoriesPreview } from '@/components/CompanionMemoriesPreview';
import { CompanionStoryPanel } from '@/components/CompanionStoryPanel';
import { CompanionUnlocksPanel } from '@/components/CompanionUnlocksPanel';
import { DimensionBoard } from '@/components/DimensionBoard';
import { ProfileOutfitPanel } from '@/components/ProfileOutfitPanel';
import { RelationshipGoalPanel } from '@/components/RelationshipGoalPanel';
import { DISCOVER_ROUTE } from '@/constants/routes';
import { useCompanion } from '@/hooks/use-companions';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useMe } from '@/hooks/use-me';
import { formatDateTime } from '@/utils/format';
import { relationshipGoalFromSummary } from '@/utils/relationship';

type Tab = { id: string; label: string };

const TABS: Tab[] = [
  { id: 'greeting', label: 'Greeting' },
  { id: 'story', label: 'Story' },
  { id: 'memories', label: 'Memories' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'unlocks', label: 'Unlocks' },
  { id: 'profile', label: 'Profile' },
];

export default function WebCompanionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companionId = Array.isArray(id) ? id[0] : id;
  const { data, error, isLoading, refetch } = useCompanion(companionId);
  const { pushError } = useErrorBanner();
  const { me } = useMe();
  const [tab, setTab] = useState<string>('greeting');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFavoriteBusy, setIsFavoriteBusy] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  if (isLoading) {
    return <WebLoading label="Loading companion..." />;
  }

  if (error || !data) {
    return (
      <WebAppShell
        title="Companion"
        subtitle="This profile could not be loaded."
        breadcrumbs={[{ href: DISCOVER_ROUTE, label: 'Discover' }]}
      >
        <WebEmptyState
          actionLabel="Try again"
          description="The companion profile could not be loaded."
          onAction={refetch}
          title="Companion unavailable"
        />
      </WebAppShell>
    );
  }

  const companion = data;
  const imageSource = mediaSource(companion.art_url);
  // Persona driver fields ship only to the owner, so they signal ownership now
  // that public companions are readable by everyone.
  const isOwner = companion.source === 'user' && companion.want !== undefined;
  const canEdit = isOwner;
  const canPublish = isOwner && Boolean(me?.is_admin);
  const isPublic = companion.is_public === true;
  const isFavorite = companion.is_favorite === true;
  const relationshipGoal = relationshipGoalFromSummary(companion.relationship);

  async function handleTogglePublish(shareStoryArcs = false) {
    setIsPublishing(true);
    try {
      await setCompanionPublic(companion.id, !isPublic, { shareStoryArcs });
      await refetch();
    } catch (nextError) {
      pushError(nextError instanceof Error ? nextError.message : 'Publish state could not be updated.');
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleToggleFavorite() {
    setIsFavoriteBusy(true);
    try {
      await favoriteCompanion(companion.id, !isFavorite);
      await refetch();
    } catch (nextError) {
      pushError(nextError instanceof Error ? nextError.message : 'Favorite state could not be updated.');
    } finally {
      setIsFavoriteBusy(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteCompanion(companion.id);
      router.replace(DISCOVER_ROUTE as Href);
    } catch (nextError) {
      setIsDeleting(false);
      setConfirmDelete(false);
      pushError(nextError instanceof Error ? nextError.message : 'Companion could not be deleted.');
    }
  }

  return (
    <WebAppShell
      title={companion.name}
      subtitle={companion.relationship_role ?? 'Companion profile'}
      breadcrumbs={[{ href: DISCOVER_ROUTE, label: 'Discover' }, { label: companion.name }]}
    >
      <View className="mb-7 flex-row flex-wrap items-start justify-between gap-4">
        <View className="min-w-0 flex-1">
          <Text className="font-serif text-display-sm text-white">{companion.name}</Text>
          <Text className="mt-2 text-body-sm leading-6 text-rose-50/60">
            {companion.relationship_role ?? companion.greeting ?? 'Open their profile, review the first beat, then start a private chat.'}
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-2">
          <WebButton
            label={isFavorite ? 'Favorited' : 'Favorite'}
            onPress={() => void handleToggleFavorite()}
            variant="outline"
            size="lg"
            isLoading={isFavoriteBusy}
            iconLeft={<Ionicons color={isFavorite ? '#FF4D7E' : '#F5EDF3'} name={isFavorite ? 'heart' : 'heart-outline'} size={18} />}
          />
          <WebButton
            label="Start chat"
            onPress={() => router.push(`/chat/${encodeURIComponent(companion.id)}` as Href)}
            variant="primary"
            size="lg"
            iconLeft={<Ionicons color="#9A2F4F" name="chatbubble-ellipses" size={18} />}
          />
        </View>
      </View>

      <View className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_2fr]">
        {/* Profile card */}
        <View className="gap-5">
          <WebCard padding="lg" className="gap-5">
            <View className="items-center gap-4">
              <CompanionArtwork
                className="aspect-[4/5] w-full rounded-2xl border border-app-rose/25 bg-app-rose-soft shadow-glow"
                label={companion.name}
                source={imageSource}
              >
                <View className="absolute left-3 top-3">
                  <WebTag size="sm" variant={companion.source === 'user' ? 'ember' : 'rose'}>
                    {companion.source === 'user' ? 'Yours' : 'Official'}
                  </WebTag>
                </View>
              </CompanionArtwork>
              <View className="items-center gap-2">
                <Text className="font-serif text-display-sm text-white">{companion.name}</Text>
                {companion.relationship_role ? (
                  <Text className="text-caption uppercase tracking-wider text-app-rose-deep">
                    {companion.relationship_role}
                  </Text>
                ) : null}
              </View>
            </View>

            <View className="border-t border-app-line-soft pt-4">
              <Text className="text-overline text-app-rose-deep">Relationship goal</Text>
              <Text className="mt-2 font-serif text-title-sm text-app-ink">{relationshipGoal.label}</Text>
              <Text className="mt-1 text-caption text-app-muted">Stage · {relationshipGoal.stage}</Text>
            </View>

            <View className="flex-row items-center justify-between gap-3 border-t border-white/8 pt-4">
              <View>
                <Text className="text-overline text-rose-50/60">First met</Text>
                <Text className="mt-1 text-body-sm text-rose-50/75">{formatDateTime(companion.relationship.first_met_at)}</Text>
              </View>
              <View>
                <Text className="text-overline text-rose-50/60 text-right">Last seen</Text>
                <Text className="mt-1 text-body-sm text-rose-50/75 text-right">{formatDateTime(companion.relationship.last_interaction_at)}</Text>
              </View>
            </View>

            <View className="gap-3 border-t border-white/8 pt-4">
              <WebButton
                label="Start chat"
                onPress={() => router.push(`/chat/${encodeURIComponent(companion.id)}` as Href)}
                variant="primary"
                iconLeft={<Ionicons color="#9A2F4F" name="chatbubble-ellipses" size={16} />}
                className="w-full"
              />
              {canPublish || canEdit ? (
                <View className="gap-2">
                  <Text className="text-overline text-rose-50/55">Manage</Text>
                  <View className="grid grid-cols-2 gap-2">
                    {canPublish ? (
                      <>
                        <WebButton
                          label={isPublishing ? 'Saving...' : isPublic ? 'Unpublish' : 'Publish'}
                          onPress={() => void handleTogglePublish(false)}
                          size="sm"
                          variant="outline"
                          className="w-full"
                        />
                        {!isPublic ? (
                          <WebButton
                            label="Publish story"
                            onPress={() => void handleTogglePublish(true)}
                            size="sm"
                            variant="outline"
                            className="w-full"
                          />
                        ) : null}
                      </>
                    ) : null}
                    {canEdit ? (
                      <>
                        <WebButton
                          label="Edit"
                          onPress={() => router.push(`/companion/${encodeURIComponent(companion.id)}/edit` as Href)}
                          size="sm"
                          variant="outline"
                          className="w-full"
                        />
                        <WebButton
                          label="Delete"
                          onPress={() => setConfirmDelete(true)}
                          size="sm"
                          variant="ghost"
                          className="w-full"
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          </WebCard>
          <ProfileOutfitPanel
            companionId={companion.id}
            hasOverride={Boolean(companion.profile_image_override)}
            name={companion.name}
            onChanged={refetch}
            onError={pushError}
          />
        </View>

        {/* Tabbed content */}
        <View className="gap-6">
          <WebTabs active={tab} onChange={setTab} tabs={TABS} variant="underline" />

          {tab === 'greeting' ? (
            <View className="gap-6">
              <WebCard padding="lg" className="gap-5">
                <View>
                  <Text className="text-overline text-rose-200">Greeting</Text>
                  <Text className="mt-2 font-serif text-title text-white">
                    {companion.greeting ?? `Start a private thread with ${companion.name}.`}
                  </Text>
                </View>
                <Text className="text-body-sm leading-7 text-rose-50/75">
                  {companion.speech_style
                    ? `Voice: ${companion.speech_style}`
                    : 'Use this opening beat to decide whether you want to chat, explore their story, or adjust the profile.'}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <WebButton
                    label="Start chat"
                    onPress={() => router.push(`/chat/${encodeURIComponent(companion.id)}` as Href)}
                    variant="primary"
                    iconLeft={<Ionicons color="#9A2F4F" name="chatbubble-ellipses" size={16} />}
                  />
                  <WebButton label="View story" onPress={() => setTab('story')} variant="outline" />
                </View>
              </WebCard>
              <RelationshipGoalPanel goal={relationshipGoal} />
              <DimensionBoard dimensions={companion.relationship.dimensions} level={companion.relationship.level} />
              <WebPanel>
                <Text className="mb-2 text-overline text-app-rose-deep">Current stage</Text>
                <Text className="font-serif text-title text-app-ink">{companion.relationship.stage ?? '—'}</Text>
                <Text className="mt-2 text-body-sm leading-6 text-app-ink-soft">
                  A snapshot of how this companion is presenting today. It shifts with your conversations, time of day, and story beat.
                </Text>
              </WebPanel>
            </View>
          ) : null}

          {tab === 'story' ? (
            <CompanionStoryPanel
              canEdit={canEdit}
              companionId={companion.id}
              onChanged={refetch}
              tone="dark"
            />
          ) : null}

          {tab === 'gallery' ? (
            <CompanionGalleryPanel
              artEmotions={companion.art_emotions}
              artUrl={companion.art_url}
              companionId={companion.id}
              name={companion.name}
            />
          ) : null}

          {tab === 'unlocks' ? (
            <CompanionUnlocksPanel companionId={companion.id} tone="dark" />
          ) : null}

          {tab === 'memories' ? (
            <CompanionMemoriesPreview companionId={companion.id} portraitUrl={companion.art_url} />
          ) : null}

          {tab === 'profile' ? (
            <WebCard padding="lg" className="gap-1">
              <Text className="mb-3 text-overline text-app-rose-deep">Character card</Text>
              <TextBlock label="Personality" value={companion.personality} />
              <TextBlock label="Background" value={companion.background} />
              <TextBlock label="Appearance" value={companion.appearance} />
              <TextBlock label="Speech style" value={companion.speech_style} />
            </WebCard>
          ) : null}
        </View>
      </View>

      <WebDialog
        description={`"${companion.name}" and all its memories will be removed from your sandbox. This cannot be undone.`}
        footer={
          <View className="flex-row items-center justify-end gap-3">
            <WebButton label="Cancel" onPress={() => setConfirmDelete(false)} variant="ghost" />
            <WebButton label="Delete" onPress={handleDelete} variant="danger" isLoading={isDeleting} />
          </View>
        }
        onClose={() => setConfirmDelete(false)}
        open={confirmDelete}
        size="sm"
        title={`Delete ${companion.name}?`}
      />
    </WebAppShell>
  );
}

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="mb-4 border-b border-app-line-soft pb-4 last:border-b-0 last:pb-0">
      <Text className="text-overline text-app-rose-deep">{label}</Text>
      <Text className="mt-1.5 text-body-sm leading-7 text-app-ink-soft">{value}</Text>
    </View>
  );
}
