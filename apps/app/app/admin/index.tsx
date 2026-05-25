import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import {
  addDevLoginAllowlistEmail,
  listDevLoginAllowlist,
  removeDevLoginAllowlistEmail,
} from '@/api/companion-client';
import type { DevLoginAllowlistItem } from '@/api/types';
import { AuthGuard } from '@/components/AuthGuard';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { TopBar } from '@/components/TopBar';
import { useErrorBanner } from '@/hooks/use-error-banner';

export default function AdminScreen() {
  const { pushError } = useErrorBanner();
  const [emails, setEmails] = useState<DevLoginAllowlistItem[]>([]);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  async function refresh() {
    const payload = await listDevLoginAllowlist();
    setEmails(payload.emails);
  }

  useEffect(() => {
    let mounted = true;
    listDevLoginAllowlist()
      .then((payload) => {
        if (mounted) setEmails(payload.emails);
      })
      .catch(() => pushError('Could not load admin workspace.'))
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [pushError]);

  async function handleAdd() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      pushError('Enter an email address.');
      return;
    }

    setIsSaving(true);
    try {
      await addDevLoginAllowlistEmail(trimmedEmail, note.trim());
      setEmail('');
      setNote('');
      await refresh();
    } catch {
      pushError('Could not add this email.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(targetEmail: string) {
    setRemovingEmail(targetEmail);
    try {
      await removeDevLoginAllowlistEmail(targetEmail);
      await refresh();
    } catch {
      pushError('Could not remove this email.');
    } finally {
      setRemovingEmail(null);
    }
  }

  if (isLoading) {
    return (
      <AuthGuard>
        <LoadingScreen label="Loading admin..." />
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <View className="flex-1 bg-app-bg">
        <TopBar showBack title="Admin" />
        <ScrollView className="flex-1">
          <View className="mx-auto w-full max-w-3xl gap-4 px-4 py-6">
            <View className="gap-4 rounded-lg border border-app-line bg-app-card p-5">
              <Text className="text-lg font-semibold text-app-text">Dev login allowlist</Text>
              <View className="gap-3">
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                  onChangeText={setEmail}
                  placeholder="user@example.com"
                  placeholderTextColor="#8B949E"
                  value={email}
                  className="min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text"
                />
                <TextInput
                  onChangeText={setNote}
                  placeholder="Note"
                  placeholderTextColor="#8B949E"
                  value={note}
                  className="min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text"
                />
                <Button isLoading={isSaving} label="Add email" onPress={handleAdd} />
              </View>
            </View>

            <View className="gap-3">
              {emails.map((item) => (
                <View key={`${item.source}:${item.email}`} className="rounded-lg border border-app-line bg-app-card p-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-base font-semibold text-app-text">
                        {item.email}
                      </Text>
                      <Text className="mt-1 text-sm text-app-muted">
                        {item.source === 'builtin' ? 'Built-in admin' : item.note || 'Custom allowlist email'}
                      </Text>
                    </View>
                    {item.source === 'custom' ? (
                      <View className="w-28">
                        <Button
                          isLoading={removingEmail === item.email}
                          label="Remove"
                          onPress={() => void handleRemove(item.email)}
                          variant="danger"
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </AuthGuard>
  );
}
