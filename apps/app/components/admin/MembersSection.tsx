import { useState } from 'react';
import { Text, View } from 'react-native';

import { WebButton, WebCard, WebFieldRow, WebInput, WebLoading, WebTag } from '@/components/web/ui';
import { useAdminMembers } from '@/hooks/use-admin-members';

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
    return <WebLoading fullscreen={false} label="Loading admin members..." />;
  }

  return (
    <View className="gap-4">
      <WebCard padding="md">
        <Text className="font-serif text-title text-app-ink">Admin members</Text>
        <Text className="mt-1 text-body-sm leading-6 text-app-muted">
          Add emails to grant admin access. Built-in admins (from environment config) cannot be removed here.
        </Text>
        <View className="mt-4 gap-3">
          <WebInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            label="Email"
            onChangeText={setEmail}
            placeholder="user@example.com"
            value={email}
          />
          <WebInput
            label="Note"
            onChangeText={setNote}
            placeholder="Why this person needs admin access"
            value={note}
          />
          <View className="self-start">
            <WebButton isLoading={isSaving} label="Add email" onPress={handleAdd} />
          </View>
        </View>
      </WebCard>

      <View className="gap-3">
        {emails.map((item) => (
          <WebCard key={`${item.source}:${item.email}`} padding="sm">
            <WebFieldRow
              description={
                item.created_by_email
                  ? `Added by ${item.created_by_email}`
                  : item.source === 'builtin'
                    ? 'Managed by environment configuration'
                    : item.note || 'Custom admin member'
              }
              label={item.email}
              value={
                <WebTag size="sm" variant={item.source === 'builtin' ? 'brand' : 'rose'}>
                  {item.source === 'builtin' ? 'Built-in' : 'Custom'}
                </WebTag>
              }
              trailing={
                item.source === 'custom' ? (
                  <WebButton
                    isLoading={removingEmail === item.email}
                    label="Remove"
                    onPress={() => void removeEmail(item.email)}
                    size="sm"
                    variant="danger"
                  />
                ) : null
              }
            />
          </WebCard>
        ))}
      </View>
    </View>
  );
}
