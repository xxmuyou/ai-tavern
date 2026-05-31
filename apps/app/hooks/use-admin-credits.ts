import { useCallback, useState } from 'react';

import {
  adjustAdminUserCredits,
  getAdminUserCredits,
  searchAdminUsers,
} from '@/api/companion-client';
import type { AdminUserCredits, AdminUserSummary } from '@/api/types';

import { useErrorBanner } from './use-error-banner';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_amount: 'Amount must be a positive whole number.',
  reason_required: 'Enter a reason for the adjustment.',
  search_required: 'Enter an email to search.',
  user_not_found: 'User not found.',
};

function friendlyError(error: unknown, fallback: string): string {
  const code = error instanceof Error ? error.message : '';
  return ERROR_MESSAGES[code] ?? fallback;
}

export function useAdminCredits() {
  const { pushError } = useErrorBanner();
  const [results, setResults] = useState<AdminUserSummary[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);
  const [detail, setDetail] = useState<AdminUserCredits | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const search = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        pushError('Enter an email to search.');
        return;
      }
      setIsSearching(true);
      try {
        const payload = await searchAdminUsers(trimmed);
        setResults(payload.users);
        setHasSearched(true);
      } catch (error) {
        pushError(friendlyError(error, 'Search failed.'));
      } finally {
        setIsSearching(false);
      }
    },
    [pushError],
  );

  const selectUser = useCallback(
    async (user: AdminUserSummary) => {
      setSelectedUser(user);
      setDetail(null);
      setIsLoadingDetail(true);
      try {
        setDetail(await getAdminUserCredits(user.user_id));
      } catch (error) {
        pushError(friendlyError(error, 'Could not load credits.'));
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [pushError],
  );

  const clearSelection = useCallback(() => {
    setSelectedUser(null);
    setDetail(null);
  }, []);

  const adjust = useCallback(
    async (amount: number, reason: string): Promise<boolean> => {
      if (!selectedUser) return false;
      if (!Number.isInteger(amount) || amount <= 0) {
        pushError('Amount must be a positive whole number.');
        return false;
      }
      if (!reason.trim()) {
        pushError('Enter a reason for the adjustment.');
        return false;
      }
      setIsAdjusting(true);
      try {
        await adjustAdminUserCredits(selectedUser.user_id, amount, reason.trim());
        setDetail(await getAdminUserCredits(selectedUser.user_id));
        return true;
      } catch (error) {
        pushError(friendlyError(error, 'Adjustment failed.'));
        return false;
      } finally {
        setIsAdjusting(false);
      }
    },
    [pushError, selectedUser],
  );

  return {
    adjust,
    clearSelection,
    detail,
    hasSearched,
    isAdjusting,
    isLoadingDetail,
    isSearching,
    results,
    search,
    selectUser,
    selectedUser,
  };
}
