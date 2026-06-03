import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { deleteCompanion, mediaSource, setCompanionPublic } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { CompanionGalleryPanel } from '@/components/CompanionGalleryPanel';
import { CompanionMemoriesPreview } from '@/components/CompanionMemoriesPreview';
import { CompanionStoryPanel } from '@/components/CompanionStoryPanel';
import { CompanionTodayPanel } from '@/components/CompanionTodayPanel';
import { CompanionUnlocksPanel } from '@/components/CompanionUnlocksPanel';
import { DimensionBoard } from '@/components/DimensionBoard';
import { EmptyState } from '@/components/EmptyState';
import { LoadingScreen } from '@/components/LoadingScreen';
import { RelationshipGoalPanel } from '@/components/RelationshipGoalPanel';
import { TopBar } from '@/components/TopBar';
import { useCompanion } from '@/hooks/use-companions';
import { useErrorBanner } from '@/hooks/use-error-banner';
import { useMe } from '@/hooks/use-me';
import { formatDateTime } from '@/utils/format';
import { relationshipGoalFromSummary } from '@/utils/relationship';

export default function CompanionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const companionId = Array.isArray(id) ? id[0] : id;
  const { data, error, isLoading, refetch } = useCompanion(companionId);
  const { pushError } = useErrorBanner();
  const { me } = useMe();

  if (isLoading) {
    return <LoadingScreen label="Loading companion..." />;
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Companion" />
        <EmptyState
          actionLabel="Try again"
          description="The companion profile could not be loaded."
          onAction={refetch}
          title="Companion unavailable"
        />
      </View>
    );
  }

  const companion = data;
  const imageSource = mediaSource(companion.art_url);
  // Persona driver fields are only sent to the owner of a user companion, so
  // their presence is a reliable "this is mine" signal — needed now that public
  // companions are readable by everyone.
  const isOwner = companion.source === 'user' && companion.want !== undefined;
  const canEdit = isOwner;
  const canPublish = isOwner && Boolean(me?.is_admin);
  const isPublic = companion.is_public === true;
  const relationshipGoal = relationshipGoalFromSummary(companion.relationship);

  function togglePublish() {
    const next = !isPublic;
    if (!next) {
      Alert.alert(
        `Unpublish ${companion.name}?`,
        `${companion.name} will be removed from the public area.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            onPress: () => {
              void setCompanionPublic(companion.id, false)
                .then(() => refetch())
                .catch((nextError) =>
                  pushError(nextError instanceof Error ? nextError.message : 'Publish state could not be updated.'),
                );
            },
            text: 'Unpublish',
          },
        ],
      );
      return;
    }

    Alert.alert(
      `Publish ${companion.name}?`,
      `${companion.name} and its portraits will appear in the public area. Story arcs stay private unless you share them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          onPress: () => {
            void setCompanionPublic(companion.id, true)
              .then(() => refetch())
              .catch((nextError) =>
                pushError(nextError instanceof Error ? nextError.message : 'Publish state could not be updated.'),
              );
          },
          text: 'Publish only',
        },
        {
          onPress: () => {
            void setCompanionPublic(companion.id, true, { shareStoryArcs: true })
              .then(() => refetch())
              .catch((nextError) =>
                pushError(nextError instanceof Error ? nextError.message : 'Publish state could not be updated.'),
              );
          },
          text: 'Publish + story',
        },
      ],
    );
  }

  function confirmDelete() {
    Alert.alert(
      `Delete ${companion.name}?`,
      `This will remove ${companion.name} from your companions. Your conversation history remains in your records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          onPress: () => {
            void deleteCompanion(companion.id)
              .then(() => router.replace('/companions' as Href))
              .catch((nextError) => pushError(nextError instanceof Error ? nextError.message : 'Companion could not be deleted.'));
          },
          style: 'destructive',
          text: 'Delete',
        },
      ],
    );
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar
        right={canEdit ? (
          <>
            {canPublish ? (
              <Pressable
                accessibilityLabel={isPublic ? 'Unpublish from public area' : 'Publish to public area'}
                accessibilityRole="button"
                onPress={togglePublish}
                className={`h-10 w-10 items-center justify-center rounded-lg border ${isPublic ? 'border-app-primary bg-app-primarySoft' : 'border-app-line'}`}
              >
                <Ionicons color={isPublic ? '#2E7D32' : '#11181C'} name={isPublic ? 'earth' : 'earth-outline'} size={20} />
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/companion/${encodeURIComponent(companion.id)}/edit` as Href)}
              className="h-10 w-10 items-center justify-center rounded-lg border border-app-line"
            >
              <Ionicons color="#11181C" name="create-outline" size={20} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmDelete}
              className="h-10 w-10 items-center justify-center rounded-lg border border-app-line"
            >
              <Ionicons color="#B3261E" name="trash-outline" size={20} />
            </Pressable>
          </>
        ) : null}
        showBack
        showQuota
        title={companion.name}
      />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-4xl gap-5 px-4 py-6">
          <View className="rounded-lg border border-app-line bg-app-card p-5">
            <View className="flex-row gap-4">
              <View
                className="h-28 w-28 items-center justify-end overflow-hidden rounded-lg border border-app-line bg-app-primarySoft"
                style={styles.portraitFrame}
              >
                <View pointerEvents="none" style={styles.portraitFloor} />
                {imageSource ? (
                  <Image
                    accessibilityLabel={companion.name}
                    resizeMode="contain"
                    source={imageSource}
                    style={styles.portraitImage}
                  />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Text className="text-5xl font-semibold text-app-primary">{companion.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <View className="min-w-0 flex-1 justify-center gap-2">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="text-3xl font-semibold text-app-text">{companion.name}</Text>
                  <View className="rounded-full bg-app-primarySoft px-3 py-1">
                    <Text className="text-sm font-semibold text-app-primary">{companion.relationship.level}</Text>
                  </View>
                </View>
                {companion.relationship_role ? <Text className="text-sm uppercase tracking-normal text-app-muted">{companion.relationship_role}</Text> : null}
                {companion.personality ? <Text className="text-base leading-6 text-app-muted">{companion.personality}</Text> : null}
              </View>
            </View>
          </View>

          <DimensionBoard dimensions={companion.relationship.dimensions} level={companion.relationship.level} />
          <RelationshipGoalPanel goal={relationshipGoal} />
          <CompanionStoryPanel
            canEdit={canEdit}
            companionId={companion.id}
            onChanged={refetch}
          />
          <CompanionUnlocksPanel companionId={companion.id} />
          <CompanionGalleryPanel
            artEmotions={companion.art_emotions}
            artUrl={companion.art_url}
            companionId={companion.id}
            name={companion.name}
          />
          <CompanionTodayPanel companionId={companion.id} recommended={relationshipGoal.recommended_activity} />

          <View className="rounded-lg border border-app-line bg-app-card p-5">
            <Text className="text-lg font-semibold text-app-text">Timeline</Text>
            <View className="mt-4 gap-3">
              <InfoRow label="First met" value={formatDateTime(companion.relationship.first_met_at)} />
              <InfoRow label="Last interaction" value={formatDateTime(companion.relationship.last_interaction_at)} />
            </View>
          </View>

          {companion.background || companion.appearance || companion.speech_style ? (
            <View className="rounded-lg border border-app-line bg-app-card p-5">
              <Text className="text-lg font-semibold text-app-text">Profile</Text>
              <View className="mt-4 gap-4">
                {companion.background ? <TextBlock label="Background" value={companion.background} /> : null}
                {companion.appearance ? <TextBlock label="Appearance" value={companion.appearance} /> : null}
                {companion.speech_style ? <TextBlock label="Speech style" value={companion.speech_style} /> : null}
              </View>
            </View>
          ) : null}

          <CompanionMemoriesPreview companionId={companion.id} portraitUrl={companion.art_url} />

          <Button label="Start chat" onPress={() => router.push(`/chat/${encodeURIComponent(companion.id)}` as Href)} />
        </View>
      </ScrollView>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-4">
      <Text className="text-sm text-app-muted">{label}</Text>
      <Text className="text-sm font-semibold text-app-text">{value}</Text>
    </View>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-sm font-semibold text-app-text">{label}</Text>
      <Text className="mt-1 text-sm leading-5 text-app-muted">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  portraitFloor: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    bottom: 0,
    height: 34,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  portraitFrame: {
    backgroundColor: '#EEF1F4',
  },
  portraitImage: {
    height: '112%',
    transform: [{ translateY: 9 }],
    width: '112%',
  },
});
