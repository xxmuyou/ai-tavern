import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { useAdminMembers } from '@/hooks/use-admin-members';

const INPUT_CLASS =
  'min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text';

export function MembersSection() {
  const { addEmail, emails, isLoading, isSaving, removeEmail, removingEmail } = useAdminMembers();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');

  async function handleAdd() {
    const ok = await addEmail(email, note);
    if (ok) {
      setEmail('');
      setNote('');
    }
  }

  if (isLoading) {
    return (
      <View className="items-center py-12">
        <ActivityIndicator color="#1E6B52" />
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">Admin members</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Add emails to grant admin access. Built-in admins (from environment config) cannot be removed here.
        </Text>
        <View className="mt-4 gap-3">
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="user@example.com"
            placeholderTextColor="#8B949E"
            value={email}
            className={INPUT_CLASS}
          />
          <TextInput
            onChangeText={setNote}
            placeholder="Note"
            placeholderTextColor="#8B949E"
            value={note}
            className={INPUT_CLASS}
          />
          <Button isLoading={isSaving} label="Add email" onPress={handleAdd} />
        </View>
      </View>

      <View className="gap-3">
        {emails.map((item) => (
          <View
            key={`${item.source}:${item.email}`}
            className="rounded-lg border border-app-line bg-white p-4"
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-base font-semibold text-app-text">
                  {item.email}
                </Text>
                <Text className="mt-1 text-sm text-app-muted">
                  {item.source === 'builtin' ? 'Built-in admin' : item.note || 'Custom admin member'}
                </Text>
                {item.created_by_email ? (
                  <Text className="mt-1 text-xs text-app-muted">Added by {item.created_by_email}</Text>
                ) : null}
              </View>
              {item.source === 'custom' ? (
                <View className="w-28">
                  <Button
                    isLoading={removingEmail === item.email}
                    label="Remove"
                    onPress={() => void removeEmail(item.email)}
                    variant="danger"
                  />
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
