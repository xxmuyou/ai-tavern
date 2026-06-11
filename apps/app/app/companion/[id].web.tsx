import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { deleteCompanion, mediaSource, setCompanionPublic } from '@/api/companion-client';
import { WebAppShell } from '@/components/web/WebAppShell';
import { WebButton, WebCard, WebDialog, WebEmptyState, WebLoading, WebPanel, WebTabs, WebTag } from '@/components/web/ui';
import { CompanionGalleryPanel } from '@/components/CompanionGalleryPanel';
import { CompanionMemoriesPreview } from '@/components/CompanionMemoriesPreview';
import { CompanionStoryPanel } from '@/components/CompanionStoryPanel';
import { CompanionUnlocksPanel } from '@/components/CompanionUnlocksPanel';
import { DimensionBoard } from '@/components/DimensionBoard';
import { ProfileOutfitPanel } from '@/components/ProfileOutfitPanel';
import { RelationshipGoalPanel } from '@/components/RelationshipGoalPanel';
import { COMPANIONS_ROUTE } from '@/constants/routes';
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
  const [isPublishing, setIsPublishing] = useState(false);

  if (isLoading) {
    return <WebLoading label="Loading companion..." />;
  }

  if (error || !data) {
    return (
      <WebAppShell
        title="Companion"
        subtitle="This profile could not be loaded."
        breadcrumbs={[{ href: COMPANIONS_ROUTE, label: 'Companions' }]}
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
  const relationshipGoal = relationshipGoalFromSummary(companion.relationship);
  const traits = (companion.personality ?? '').split(/[.,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 4);

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

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteCompanion(companion.id);
      router.replace(COMPANIONS_ROUTE as Href);
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
      breadcrumbs={[{ href: COMPANIONS_ROUTE, label: 'Companions' }, { label: companion.name }]}
    >
      <View className="mb-7 flex-row flex-wrap items-start justify-between gap-4">
        <View className="min-w-0 flex-1">
          <Text className="font-serif text-display-sm text-app-ink">{companion.name}</Text>
          <Text className="mt-2 text-body-sm leading-6 text-app-muted">
            {companion.relationship_role ?? companion.greeting ?? 'Open their profile, review the first beat, then start a private chat.'}
          </Text>
        </View>
        <WebButton
          label="Start chat"
          onPress={() => router.push(`/chat/${encodeURIComponent(companion.id)}` as Href)}
          variant="primary"
          size="lg"
          iconLeft={<Ionicons color="#9A2F4F" name="chatbubble-ellipses" size={18} />}
        />
      </View>

      <View className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_2fr]">
        {/* Profile card */}
        <View className="gap-5">
          <WebCard padding="lg" className="gap-5">
            <View className="items-center gap-4">
              <View className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-rose-soft shadow-float">
                <View pointerEvents="none" style={portraitStyles.portraitFloor} />
                {imageSource ? (
                  <Image
                    accessibilityLabel={companion.name}
                    resizeMode="contain"
                    source={imageSource}
                    style={portraitStyles.portraitImage}
                  />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Text className="font-serif text-display-2xl text-rose-deep/60">
                      {companion.name.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View className="absolute left-3 top-3">
                  <WebTag size="sm" variant={companion.source === 'user' ? 'ember' : 'rose'}>
                    {companion.source === 'user' ? 'Yours' : 'Official'}
                  </WebTag>
                </View>
              </View>
              <View className="items-center gap-2">
                <Text className="font-serif text-display-sm text-app-ink">{companion.name}</Text>
                {companion.relationship_role ? (
                  <Text className="text-caption uppercase tracking-wider text-rose-deep">
                    {companion.relationship_role}
                  </Text>
                ) : null}
              </View>
            </View>

            {traits.length > 0 ? (
              <View className="flex-row flex-wrap justify-center gap-1.5">
                {traits.map((trait) => (
                  <WebTag key={trait} size="sm" variant="rose">
                    {trait}
                  </WebTag>
                ))}
              </View>
            ) : null}

            <View className="border-t border-app-line-soft pt-4">
              <Text className="text-overline text-rose-deep">Relationship goal</Text>
              <Text className="mt-2 font-serif text-title-sm text-app-ink">{relationshipGoal.label}</Text>
              <Text className="mt-1 text-caption text-app-muted">Stage · {relationshipGoal.stage}</Text>
            </View>

            <View className="flex-row items-center justify-between gap-3 border-t border-app-line-soft pt-4">
              <View>
                <Text className="text-overline text-app-muted">First met</Text>
                <Text className="mt-1 text-body-sm text-app-ink-soft">{formatDateTime(companion.relationship.first_met_at)}</Text>
              </View>
              <View>
                <Text className="text-overline text-app-muted text-right">Last seen</Text>
                <Text className="mt-1 text-body-sm text-app-ink-soft text-right">{formatDateTime(companion.relationship.last_interaction_at)}</Text>
              </View>
            </View>

            <View className="gap-2 border-t border-app-line-soft pt-4">
              <WebButton
                label="Chat now"
                onPress={() => router.push(`/chat/${encodeURIComponent(companion.id)}` as Href)}
                variant="primary"
                iconLeft={<Ionicons color="#9A2F4F" name="chatbubble-ellipses" size={16} />}
              />
              {canPublish || canEdit ? (
                <View className="flex-row flex-wrap gap-2">
                  {canPublish ? (
                    <>
                      <WebButton
                        label={isPublishing ? 'Saving…' : isPublic ? 'Unpublish' : 'Publish'}
                        onPress={() => void handleTogglePublish(false)}
                        size="sm"
                        variant="outline"
                      />
                      {!isPublic ? (
                        <WebButton
                          label="Publish + story"
                          onPress={() => void handleTogglePublish(true)}
                          size="sm"
                          variant="ghost"
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
                      />
                      <WebButton label="Delete" onPress={() => setConfirmDelete(true)} size="sm" variant="ghost" />
                    </>
                  ) : null}
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
                  <Text className="text-overline text-rose-deep">Greeting</Text>
                  <Text className="mt-2 font-serif text-title text-app-ink">
                    {companion.greeting ?? `Start a private thread with ${companion.name}.`}
                  </Text>
                </View>
                <Text className="text-body-sm leading-7 text-app-ink-soft">
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
                <Text className="mb-2 text-overline text-rose-deep">Current stage</Text>
                <Text className="font-serif text-title text-app-ink">{companion.relationship.stage ?? '—'}</Text>
                <Text className="mt-2 text-body-sm leading-6 text-app-ink-soft">
                  This profile snapshot updates as conversations, choices, and scene moments change the relationship.
                </Text>
              </WebPanel>
            </View>
          ) : null}

          {tab === 'story' ? (
            <CompanionStoryPanel
              canEdit={canEdit}
              companionId={companion.id}
              onChanged={refetch}
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
            <CompanionUnlocksPanel companionId={companion.id} />
          ) : null}

          {tab === 'memories' ? (
            <CompanionMemoriesPreview companionId={companion.id} portraitUrl={companion.art_url} />
          ) : null}

          {tab === 'profile' ? (
            <WebCard padding="lg" className="gap-1">
              <Text className="mb-3 text-overline text-rose-deep">Character card</Text>
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

const portraitStyles = StyleSheet.create({
  portraitFloor: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    bottom: 0,
    height: 64,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  portraitImage: {
    height: '112%',
    transform: [{ translateY: 12 }],
    width: '112%',
  },
});

function TextBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="mb-4 border-b border-app-line-soft pb-4 last:border-b-0 last:pb-0">
      <Text className="text-overline text-rose-deep">{label}</Text>
      <Text className="mt-1.5 text-body-sm leading-7 text-app-ink-soft">{value}</Text>
    </View>
  );
}
