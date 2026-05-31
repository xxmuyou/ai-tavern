import { useRouter, type Href } from 'expo-router';
import { Text, View } from 'react-native';

import type { RelationshipUnlockItem, RelationshipUnlocksResponse } from '@/api/types';
import { Button } from '@/components/Button';
import { useCompanionUnlocks } from '@/hooks/use-companions';

const BILLING_ROUTE = '/billing' as Href;

function prettyStage(stage: string): string {
  return stage
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * spec-025 §B5: persistent "Unlocked" section on the companion profile. Shows
 * earned story moments / expressions / places, and locked ones with the stage
 * still to reach. Secret text is gated: Pro (or the owner) sees it; free users
 * see that it's unlocked plus an upgrade prompt.
 */
export function CompanionUnlocksPanel({ companionId }: { companionId: string }) {
  const router = useRouter();
  const { data } = useCompanionUnlocks(companionId);
  if (!data) {
    return null;
  }

  const secretItem = data.items.find((i) => i.key === 'secret');
  const moments = data.items.filter((i) => i.key !== 'secret');

  return (
    <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5 web:bg-white">
      <Text className="text-xl font-semibold text-app-text">Unlocked</Text>

      {secretItem ? (
        <SecretRow item={secretItem} data={data} onUpgrade={() => router.push(BILLING_ROUTE)} />
      ) : null}

      {moments.map((item) => (
        <UnlockRow key={item.key} item={item} />
      ))}

      {data.scenes.length > 0 ? (
        <View className="gap-3 border-t border-app-line pt-4">
          <Text className="text-sm font-semibold text-app-text">Places</Text>
          {data.scenes.map((scene) => (
            <View key={scene.id} className="flex-row items-start gap-2">
              <Text className="text-base">{scene.unlocked ? '✓' : '🔒'}</Text>
              <View className="flex-1">
                <Text className={`text-sm font-medium ${scene.unlocked ? 'text-app-text' : 'text-app-muted'}`}>
                  {scene.name}
                </Text>
                {!scene.unlocked && scene.hint ? (
                  <Text className="mt-0.5 text-xs text-app-muted">{scene.hint}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function UnlockRow({ item }: { item: RelationshipUnlockItem }) {
  return (
    <View className="flex-row items-start gap-2">
      <Text className="text-base">{item.unlocked ? '✓' : '🔒'}</Text>
      <View className="flex-1">
        <Text className={`text-sm font-medium ${item.unlocked ? 'text-app-text' : 'text-app-muted'}`}>
          {item.label}
        </Text>
        {!item.unlocked ? (
          <Text className="mt-0.5 text-xs text-app-muted">
            Reach the {prettyStage(item.required_stage)} stage
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function SecretRow({
  item,
  data,
  onUpgrade,
}: {
  item: RelationshipUnlockItem;
  data: RelationshipUnlocksResponse;
  onUpgrade: () => void;
}) {
  // Not yet unlocked: show the locked goal.
  if (!data.secret_unlocked) {
    return (
      <View className="flex-row items-start gap-2">
        <Text className="text-base">🔒</Text>
        <View className="flex-1">
          <Text className="text-sm font-medium text-app-muted">{item.label}</Text>
          <Text className="mt-0.5 text-xs text-app-muted">
            Reach the {prettyStage(item.required_stage)} stage
          </Text>
        </View>
      </View>
    );
  }

  // Unlocked + viewable (Pro or owner): show the secret text.
  if (data.secret) {
    return (
      <View className="gap-1 rounded-lg bg-app-primarySoft px-3 py-3">
        <Text className="text-xs font-semibold uppercase tracking-wide text-app-primary">
          Their secret
        </Text>
        <Text className="text-sm leading-6 text-app-text">{data.secret}</Text>
      </View>
    );
  }

  // Unlocked but gated behind Pro for free users.
  return (
    <View className="gap-2 rounded-lg border border-app-primary/30 bg-app-primarySoft px-3 py-3">
      <Text className="text-sm font-semibold text-app-text">✦ {item.label}</Text>
      <Text className="text-xs text-app-muted">Upgrade to Pro to read what they trusted you with.</Text>
      <Button label="Upgrade to Pro" onPress={onUpgrade} />
    </View>
  );
}
