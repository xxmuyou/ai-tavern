import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { PALETTE } from '@/constants/palette';

import { importCompanionCard } from '@/api/companion-client';
import { Button } from '@/components/Button';
import { TopBar } from '@/components/TopBar';

export default function CompanionImportScreen() {
  const router = useRouter();
  const [json, setJson] = useState('');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      setError('That is not valid JSON. Paste the full character card.');
      return;
    }
    setIsImporting(true);
    try {
      const created = await importCompanionCard(parsed, gender);
      // Send them to the editor so they can add a portrait and fine-tune.
      router.replace(`/companion/${encodeURIComponent(created.id)}/edit` as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import this card.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <View className="flex-1 bg-app-bg">
      <TopBar showBack title="Import character card" />
      <ScrollView className="flex-1">
        <View className="mx-auto w-full max-w-3xl gap-4 px-4 py-6">
          <Text className="text-sm leading-5 text-app-muted">
            Paste a Tavern / Character Card V2 JSON (the format used by SillyTavern and chub.ai). We map the name,
            greeting, persona, example lines, and tags. Add a portrait afterwards in the editor.
          </Text>

          {error ? (
            <View className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <Text className="text-sm font-medium text-red-800">{error}</Text>
            </View>
          ) : null}

          <View>
            <Text className="mb-2 text-sm font-semibold text-app-text">Gender</Text>
            <View className="flex-row gap-2">
              {(['female', 'male'] as const).map((value) => {
                const active = gender === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    onPress={() => setGender(value)}
                    className={`rounded-full border px-4 py-2 ${active ? 'border-app-primary bg-app-primary' : 'border-app-line bg-app-surface'}`}
                  >
                    <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-app-muted'}`}>
                      {value === 'female' ? 'Female' : 'Male'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="mt-1 text-xs text-app-muted">Cards have no gender — you can change this later.</Text>
          </View>

          <View>
            <Text className="mb-2 text-sm font-semibold text-app-text">Card JSON</Text>
            <TextInput
              multiline
              value={json}
              onChangeText={setJson}
              placeholder='{ "spec": "chara_card_v2", "data": { "name": "...", ... } }'
              placeholderTextColor={PALETTE.muted}
              textAlignVertical="top"
              className="min-h-56 rounded-lg border border-app-line bg-app-sunken px-3 py-3 text-sm text-app-text"
            />
          </View>

          <Button
            label="Import"
            isLoading={isImporting}
            disabled={json.trim().length === 0}
            onPress={() => void runImport()}
          />
        </View>
      </ScrollView>
    </View>
  );
}
