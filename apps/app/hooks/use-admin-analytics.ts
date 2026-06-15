import { useCallback, useEffect, useState } from 'react';

import {
  getAdminAnalyticsOverview,
  listAdminUsersByRecentSignup,
} from '@/api/companion-client';
import type {
  AdminAnalyticsOverviewResponse,
  AdminAnalyticsUser,
  AdminAnalyticsWindow,
} from '@/api/types';

import { useErrorBanner } from './use-error-banner';

const RECENT_SIGNUPS_PAGE_SIZE = 20;

function friendlyMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useAdminAnalytics() {
  const { pushError } = useErrorBanner();
  const [window, setWindow] = useState<AdminAnalyticsWindow>('7d');
  const [overview, setOverview] = useState<AdminAnalyticsOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recentDialogOpen, setRecentDialogOpen] = useState(false);
  const [recentUsers, setRecentUsers] = useState<AdminAnalyticsUser[]>([]);
  const [recentUsersCursor, setRecentUsersCursor] = useState<string | null>(null);
  const [isLoadingRecentUsers, setIsLoadingRecentUsers] = useState(false);
  const [isLoadingMoreRecentUsers, setIsLoadingMoreRecentUsers] = useState(false);

  const loadOverview = useCallback(
    async (nextWindow: AdminAnalyticsWindow, mode: 'initial' | 'manual' = 'initial') => {
      if (mode === 'initial') {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError(null);

      try {
        setOverview(await getAdminAnalyticsOverview(nextWindow));
      } catch (nextError) {
        const message = friendlyMessage(nextError, 'Could not load analytics.');
        setError(message);
        pushError(message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [pushError],
  );

  useEffect(() => {
    void loadOverview(window, 'initial');
  }, [loadOverview, window]);

  const refresh = useCallback(async () => {
    await loadOverview(window, 'manual');
  }, [loadOverview, window]);

  const changeWindow = useCallback((nextWindow: AdminAnalyticsWindow) => {
    setWindow(nextWindow);
  }, []);

  const loadRecentUsers = useCallback(
    async (mode: 'initial' | 'more') => {
      if (mode === 'initial') {
        setIsLoadingRecentUsers(true);
      } else {
        setIsLoadingMoreRecentUsers(true);
      }

      try {
        const payload = await listAdminUsersByRecentSignup({
          cursor: mode === 'more' ? recentUsersCursor : null,
          limit: RECENT_SIGNUPS_PAGE_SIZE,
        });
        setRecentUsers((current) => mode === 'more' ? [...current, ...payload.items] : payload.items);
        setRecentUsersCursor(payload.next_cursor);
      } catch (nextError) {
        pushError(friendlyMessage(nextError, 'Could not load recent users.'));
      } finally {
        setIsLoadingRecentUsers(false);
        setIsLoadingMoreRecentUsers(false);
      }
    },
    [pushError, recentUsersCursor],
  );

  const openRecentUsers = useCallback(async () => {
    setRecentDialogOpen(true);
    if (recentUsers.length === 0) {
      await loadRecentUsers('initial');
    }
  }, [loadRecentUsers, recentUsers.length]);

  const closeRecentUsers = useCallback(() => {
    setRecentDialogOpen(false);
  }, []);

  const reloadRecentUsers = useCallback(async () => {
    setRecentUsers([]);
    setRecentUsersCursor(null);
    await loadRecentUsers('initial');
  }, [loadRecentUsers]);

  const loadMoreRecentUsers = useCallback(async () => {
    if (!recentUsersCursor || isLoadingMoreRecentUsers) return;
    await loadRecentUsers('more');
  }, [isLoadingMoreRecentUsers, loadRecentUsers, recentUsersCursor]);

  return {
    changeWindow,
    closeRecentUsers,
    error,
    isLoading,
    isLoadingMoreRecentUsers,
    isLoadingRecentUsers,
    isRefreshing,
    loadMoreRecentUsers,
    openRecentUsers,
    overview,
    recentDialogOpen,
    recentUsers,
    recentUsersCursor,
    refresh,
    reloadRecentUsers,
    window,
  };
}
