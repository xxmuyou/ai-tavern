import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import type { AdminLedgerEntry } from '@/api/types';
import { Button } from '@/components/Button';
import { useAdminCredits } from '@/hooks/use-admin-credits';

const INPUT_CLASS =
  'min-h-12 rounded-lg border border-app-line bg-white px-4 text-base text-app-text';

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
    <View className="gap-4">
      <View className="rounded-lg border border-app-line bg-white p-5">
        <Text className="text-lg font-semibold text-app-text">Find a user</Text>
        <Text className="mt-1 text-sm leading-6 text-app-muted">
          Search by email (exact or prefix match).
        </Text>
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1">
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              inputMode="email"
              onChangeText={setQuery}
              onSubmitEditing={() => void search(query)}
              placeholder="user@example.com"
              placeholderTextColor="#8B949E"
              value={query}
              className={INPUT_CLASS}
            />
          </View>
          <View className="w-32">
            <Button isLoading={isSearching} label="Search" onPress={() => void search(query)} />
          </View>
        </View>

        {hasSearched && results.length === 0 ? (
          <Text className="mt-4 text-sm text-app-muted">No users matched.</Text>
        ) : null}

        {results.length > 0 ? (
          <View className="mt-4 gap-2">
            {results.map((user) => {
              const isSelected = selectedUser?.user_id === user.user_id;
              return (
                <Pressable
                  key={user.user_id}
                  accessibilityRole="button"
                  onPress={() => void selectUser(user)}
                  className={`flex-row items-center justify-between rounded-lg border p-3 ${
                    isSelected ? 'border-app-primary bg-app-primarySoft' : 'border-app-line bg-white'
                  }`}
                >
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-semibold text-app-text">
                    {user.email}
                  </Text>
                  <Text className="ml-3 text-xs font-semibold uppercase text-app-muted">{user.tier}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {selectedUser ? (
        <View className="rounded-lg border border-app-line bg-white p-5">
          <Text numberOfLines={1} className="text-lg font-semibold text-app-text">
            {selectedUser.email}
          </Text>

          {isLoadingDetail || !detail ? (
            <Text className="mt-3 text-sm text-app-muted">Loading credits...</Text>
          ) : (
            <View className="mt-4 gap-5">
              <View className="flex-row gap-4">
                <BalanceCell label="Available" value={detail.available_credits} />
                <BalanceCell label="Reserved" value={detail.reserved_credits} />
              </View>

              <View className="gap-3">
                <Text className="text-sm font-semibold text-app-text">Add credits</Text>
                <TextInput
                  inputMode="numeric"
                  keyboardType="number-pad"
                  onChangeText={setAmount}
                  placeholder="Amount (positive whole number)"
                  placeholderTextColor="#8B949E"
                  value={amount}
                  className={INPUT_CLASS}
                />
                <TextInput
                  onChangeText={setReason}
                  placeholder="Reason (required, for audit)"
                  placeholderTextColor="#8B949E"
                  value={reason}
                  className={INPUT_CLASS}
                />
                <Button isLoading={isAdjusting} label="Add credits" onPress={handleAdjust} />
              </View>

              <View className="gap-2">
                <Text className="text-sm font-semibold text-app-text">Recent activity</Text>
                {detail.recent_ledger.length === 0 ? (
                  <Text className="text-sm text-app-muted">No ledger entries yet.</Text>
                ) : (
                  detail.recent_ledger.map((entry) => <LedgerRow key={entry.id} entry={entry} />)
                )}
              </View>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

function BalanceCell({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-1 rounded-lg border border-app-line bg-app-bg p-4">
      <Text className="text-xs uppercase text-app-muted">{label}</Text>
      <Text className="mt-1 text-2xl font-semibold text-app-text">{value}</Text>
    </View>
  );
}

function LedgerRow({ entry }: { entry: AdminLedgerEntry }) {
  const signed = entry.amount > 0 ? `+${entry.amount}` : String(entry.amount);
  return (
    <View className="flex-row items-start justify-between gap-3 border-b border-app-line py-2 last:border-b-0">
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-app-text">{entry.type}</Text>
        {entry.reason ? <Text className="mt-0.5 text-xs text-app-muted">{entry.reason}</Text> : null}
        <Text className="mt-0.5 text-xs text-app-muted">{formatDate(entry.created_at)}</Text>
      </View>
      <View className="items-end">
        <Text className={`text-sm font-semibold ${entry.amount > 0 ? 'text-app-primary' : 'text-app-text'}`}>
          {signed}
        </Text>
        <Text className="mt-0.5 text-xs text-app-muted">bal {entry.balance_after}</Text>
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
