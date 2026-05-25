import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  addAdminAllowlistEmail,
  listAdminAllowlist,
  removeAdminAllowlistEmail,
} from '@/api/companion-client';
import type { AdminAllowlistItem } from '@/api/types';
import { AdminGuard } from '@/components/AdminGuard';
import { Button } from '@/components/Button';
import { LoadingScreen } from '@/components/LoadingScreen';
import { WebAppShell, WebPanel } from '@/components/web/WebAppShell';
import { useErrorBanner } from '@/hooks/use-error-banner';

export default function WebAdminScreen() {
  return (
    <AdminGuard>
      <WebAdminContent />
    </AdminGuard>
  );
}

function WebAdminContent() {
  const { pushError } = useErrorBanner();
  const [emails, setEmails] = useState<AdminAllowlistItem[]>([]);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  async function refresh() {
    const payload = await listAdminAllowlist();
    setEmails(payload.emails);
  }

  useEffect(() => {
    let mounted = true;
    listAdminAllowlist()
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
      await addAdminAllowlistEmail(trimmedEmail, note.trim());
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
      await removeAdminAllowlistEmail(targetEmail);
      await refresh();
    } catch {
      pushError('Could not remove this email.');
    } finally {
      setRemovingEmail(null);
    }
  }

  if (isLoading) {
    return <LoadingScreen label="Loading admin..." />;
  }

  return (
    <WebAppShell title="Admin" subtitle="Manage admin members and operational controls.">
      <View className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <WebPanel>
          <Text className="text-xl font-semibold text-app-text">Admin members</Text>
          <Text className="mt-2 text-sm leading-6 text-app-muted">
            Add emails to grant admin access. Built-in admins (from environment config) cannot be removed here.
          </Text>
          <View className="mt-6 gap-3">
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              onChangeText={setEmail}
              placeholder="user@example.com"
              placeholderTextColor="#8B949E"
              value={email}
              className="min-h-12 rounded-md border border-app-line bg-white px-4 text-base text-app-text"
            />
            <TextInput
              onChangeText={setNote}
              placeholder="Note"
              placeholderTextColor="#8B949E"
              value={note}
              className="min-h-12 rounded-md border border-app-line bg-white px-4 text-base text-app-text"
            />
            <Button isLoading={isSaving} label="Add email" onPress={handleAdd} />
          </View>
        </WebPanel>

        <View className="gap-3 xl:col-span-2">
          {emails.map((item) => (
            <View key={`${item.source}:${item.email}`} className="rounded-lg border border-app-line bg-white p-5">
              <View className="flex-row items-start justify-between gap-5">
                <View className="min-w-0 flex-1">
                  <Text className="text-lg font-semibold text-app-text">{item.email}</Text>
                  <Text className="mt-1 text-sm text-app-muted">
                    {item.source === 'builtin' ? 'Built-in admin' : item.note || 'Custom admin member'}
                  </Text>
                  {item.created_by_email ? <Text className="mt-1 text-xs text-app-muted">Added by {item.created_by_email}</Text> : null}
                </View>
                {item.source === 'custom' ? (
                  <View className="w-32">
                    <Button isLoading={removingEmail === item.email} label="Remove" onPress={() => void handleRemove(item.email)} variant="danger" />
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>
    </WebAppShell>
  );
}
