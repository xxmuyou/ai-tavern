import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { WebButton, WebInput, WebLoading, WebStat, WebTag, WebTimeline, type WebTimelineEntry } from '@/components/web/ui';
import { useAdminCredits } from '@/hooks/use-admin-credits';

import { AdminPanel, AdminPanelHeader } from './AdminPanel';

export function CreditsSection() {
  const {
    adjust,
    detail,
    hasSearched,
    isAdjusting,
    isLoadingDetail,
    isSearching,
    results,
    search,
    selectUser,
    selectedUser,
  } = useAdminCredits();
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  async function handleAdjust() {
    const ok = await adjust(Number(amount), reason);
    if (ok) {
      setAmount('');
      setReason('');
    }
  }

  return (
    <View className="gap-3">
      <AdminPanel>
        <AdminPanelHeader subtitle="Search by email (exact or prefix match)." title="Find a user" />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <WebInput
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              label="Search user"
              onChangeText={setQuery}
              onSubmitEditing={() => void search(query)}
              placeholder="user@example.com"
              value={query}
            />
          </View>
          <View className="justify-end">
            <WebButton isLoading={isSearching} label="Search" onPress={() => void search(query)} size="sm" />
          </View>
        </View>

        {hasSearched && results.length === 0 ? (
          <Text className="text-body-sm text-app-muted">No users matched.</Text>
        ) : null}

        {results.length > 0 ? (
          <View className="gap-2">
            {results.map((user) => {
              const isSelected = selectedUser?.user_id === user.user_id;
              return (
                <Pressable
                  key={user.user_id}
                  accessibilityRole="button"
                  onPress={() => void selectUser(user)}
                  className={`flex-row items-center justify-between rounded-xl border p-3 ${
                    isSelected ? 'border-rose bg-rose-soft' : 'border-app-line bg-app-surface'
                  }`}
                >
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-body-sm font-semibold text-app-ink">
                    {user.email}
                  </Text>
                  <WebTag size="sm" variant={user.tier === 'pro' ? 'rose' : 'neutral'}>
                    {user.tier}
                  </WebTag>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </AdminPanel>

      {selectedUser ? (
        <AdminPanel>
          <AdminPanelHeader title={selectedUser.email} />

          {isLoadingDetail || !detail ? (
            <WebLoading fullscreen={false} label="Loading credits..." />
          ) : (
            <View className="gap-5">
              <View className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <WebStat eyebrow="Available" value={String(detail.available_credits)} />
                <WebStat eyebrow="Reserved" value={String(detail.reserved_credits)} />
              </View>

              <View className="gap-3">
                <Text className="text-body-sm font-semibold text-app-ink">Add credits</Text>
                <WebInput
                  inputMode="numeric"
                  label="Amount"
                  keyboardType="number-pad"
                  onChangeText={setAmount}
                  placeholder="Amount (positive whole number)"
                  value={amount}
                />
                <WebInput
                  label="Reason"
                  onChangeText={setReason}
                  placeholder="Reason (required, for audit)"
                  value={reason}
                />
                <View className="self-start">
                  <WebButton isLoading={isAdjusting} label="Add credits" onPress={handleAdjust} size="sm" />
                </View>
              </View>

              <View className="gap-2">
                <Text className="text-body-sm font-semibold text-app-ink">Recent activity</Text>
                <WebTimeline
                  emptyLabel="No ledger entries yet."
                  entries={detail.recent_ledger.map((entry): WebTimelineEntry => ({
                    body: entry.reason ?? `Balance after ${entry.balance_after}`,
                    id: entry.id,
                    meta: formatDate(entry.created_at),
                    title: `${entry.type} · ${entry.amount > 0 ? '+' : ''}${entry.amount}`,
                  }))}
                />
              </View>
            </View>
          )}
        </AdminPanel>
      ) : null}
    </View>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
