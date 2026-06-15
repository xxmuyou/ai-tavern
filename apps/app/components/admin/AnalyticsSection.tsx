import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type {
  AdminAnalyticsRevenuePoint,
  AdminAnalyticsSignupPoint,
  AdminAnalyticsUser,
  AdminAnalyticsWindow,
} from '@/api/types';
import {
  WebButton,
  WebCard,
  WebDialog,
  WebFieldRow,
  WebLoading,
  WebStat,
  WebTag,
} from '@/components/web/ui';
import { PALETTE } from '@/constants/palette';
import { useAdminAnalytics } from '@/hooks/use-admin-analytics';

import { AdminPanel, AdminPanelHeader } from './AdminPanel';

const WINDOWS: AdminAnalyticsWindow[] = ['today', '7d', '30d'];
const RECENT_SIGNUPS_SUMMARY_COUNT = 5;

export function AnalyticsSection() {
  const {
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
  } = useAdminAnalytics();

  if (isLoading && !overview) {
    return <WebLoading fullscreen={false} label="Loading analytics..." />;
  }

  if (!overview) {
    return (
      <AdminPanel>
        <AdminPanelHeader
          error={error}
          subtitle="Analytics could not be loaded."
          title="User analytics"
        />
        <View className="self-start">
          <WebButton label="Retry" onPress={() => void refresh()} size="sm" />
        </View>
      </AdminPanel>
    );
  }

  const signupsTotal = overview.signups_by_day.reduce((sum, point) => sum + point.users, 0);
  const grossRevenueTotal = overview.revenue_by_day.reduce((sum, point) => sum + point.gross_revenue_usd, 0);
  const recentSignups = overview.recent_signups.slice(0, RECENT_SIGNUPS_SUMMARY_COUNT);

  return (
    <View className="gap-3">
      <AdminPanel>
        <AdminPanelHeader
          error={error}
          subtitle="User growth, membership mix, and gross revenue. Refresh manually whenever you want a fresh snapshot."
          title="Analytics"
        />
        <View className="flex-row flex-wrap items-center gap-2">
          {WINDOWS.map((item) => (
            <WebButton
              key={item}
              label={windowLabel(item)}
              onPress={() => changeWindow(item)}
              size="sm"
              variant={window === item ? 'primary' : 'outline'}
            />
          ))}
          <WebButton
            iconLeft={<Ionicons color={PALETTE.ink} name="refresh-outline" size={16} />}
            isLoading={isRefreshing}
            label="Refresh"
            onPress={() => void refresh()}
            size="sm"
            variant="secondary"
          />
        </View>
      </AdminPanel>

      <View className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <View className="gap-3">
          <SummaryPanel
            items={[
              { eyebrow: 'Total users', value: formatInteger(overview.summary.total_users) },
              { eyebrow: `${windowLabel(window)} new`, value: formatInteger(overview.summary.new_users) },
              { eyebrow: 'Active users', value: formatInteger(overview.summary.active_users) },
              { eyebrow: 'Free users', value: formatInteger(overview.summary.free_users) },
              { eyebrow: 'Pro users', value: formatInteger(overview.summary.pro_users) },
              { eyebrow: 'Active subscriptions', value: formatInteger(overview.summary.active_subscriptions) },
            ]}
            subtitle="All user-side snapshot metrics live here."
            title="Users"
          />

          <AdminPanel>
            <AdminPanelHeader
              subtitle="Current user tier mix and latest subscription statuses."
              title="Membership breakdown"
            />
            <View>
              {overview.tier_breakdown.map((item) => (
                <WebFieldRow
                  key={`tier:${item.tier}`}
                  label={item.tier === 'pro' ? 'Pro' : 'Free'}
                  value={formatInteger(item.count)}
                />
              ))}
              {overview.subscription_status_breakdown.map((item) => (
                <WebFieldRow
                  key={`status:${item.status}`}
                  label={humanizeStatus(item.status)}
                  value={formatInteger(item.count)}
                />
              ))}
            </View>
          </AdminPanel>
        </View>

        <View className="gap-3">
          <SummaryPanel
            items={[
              { eyebrow: 'Gross revenue', value: formatUsd(overview.summary.gross_revenue_usd) },
              { eyebrow: 'Credits revenue', value: formatUsd(overview.summary.credits_revenue_usd) },
              { eyebrow: 'Subscription revenue', value: formatUsd(overview.summary.subscription_revenue_usd) },
            ]}
            subtitle="Revenue metrics stay grouped together."
            title="Revenue"
          >
            {overview.revenue_status.message ? (
              <Text className="text-xs font-semibold text-app-rose-deep">{overview.revenue_status.message}</Text>
            ) : null}
          </SummaryPanel>

          <AdminPanel>
            <AdminPanelHeader
              subtitle={`Dashboard shows the latest ${RECENT_SIGNUPS_SUMMARY_COUNT} signups.`}
              title="Recent signups"
            />
            <View className="gap-1.5">
              {recentSignups.length === 0 ? (
                <Text className="text-sm text-app-muted">No signups yet.</Text>
              ) : (
                recentSignups.map((user) => (
                  <RecentSignupRow compact key={user.user_id} user={user} />
                ))
              )}
            </View>
            <View className="self-start">
              <WebButton label="View all" onPress={() => void openRecentUsers()} size="sm" variant="outline" />
            </View>
          </AdminPanel>
        </View>
      </View>

      <View className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <TrendPanel
          description={`${formatInteger(signupsTotal)} signups in ${windowLabel(window).toLowerCase()}.`}
          points={overview.signups_by_day}
          title="Signup trend"
          valueFormatter={formatInteger}
          valueForPoint={(point) => point.users}
        />
        <TrendPanel
          description={`${formatUsd(grossRevenueTotal)} gross revenue in ${windowLabel(window).toLowerCase()}.`}
          points={overview.revenue_by_day}
          title="Revenue trend"
          valueFormatter={formatUsdCompact}
          valueForPoint={(point) => point.gross_revenue_usd}
        />
      </View>

      <WebDialog
        description="Browse the complete signup list without leaving the dashboard."
        footer={
          <View className="flex-row items-center justify-between gap-3">
            <WebButton label="Reload" onPress={() => void reloadRecentUsers()} size="sm" variant="secondary" />
            <View className="flex-row gap-2">
              <WebButton label="Close" onPress={closeRecentUsers} size="sm" variant="ghost" />
              <WebButton
                disabled={!recentUsersCursor}
                isLoading={isLoadingMoreRecentUsers}
                label="Load more users"
                onPress={() => void loadMoreRecentUsers()}
                size="sm"
                variant="outline"
              />
            </View>
          </View>
        }
        onClose={closeRecentUsers}
        open={recentDialogOpen}
        size="lg"
        title="Recent signups"
      >
        {isLoadingRecentUsers && recentUsers.length === 0 ? (
          <WebLoading fullscreen={false} label="Loading recent users..." />
        ) : recentUsers.length === 0 ? (
          <Text className="text-sm text-app-muted">No users to show yet.</Text>
        ) : (
          <View className="gap-2">
            {recentUsers.map((user) => (
              <RecentSignupRow key={`dialog:${user.user_id}`} user={user} />
            ))}
          </View>
        )}
      </WebDialog>
    </View>
  );
}

function SummaryPanel({
  children,
  items,
  subtitle,
  title,
}: {
  children?: ReactNode;
  items: Array<{ eyebrow: string; value: string }>;
  subtitle: string;
  title: string;
}) {
  return (
    <AdminPanel>
      <AdminPanelHeader subtitle={subtitle} title={title} />
      <View className={items.length <= 3 ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2'}>
        {items.map((item) => (
          <WebStat
            key={`${title}:${item.eyebrow}`}
            className="p-4"
            eyebrow={item.eyebrow}
            value={item.value}
          />
        ))}
      </View>
      {children}
    </AdminPanel>
  );
}

function TrendPanel<T extends AdminAnalyticsSignupPoint | AdminAnalyticsRevenuePoint>({
  description,
  points,
  title,
  valueFormatter,
  valueForPoint,
}: {
  description: string;
  points: T[];
  title: string;
  valueFormatter: (value: number) => string;
  valueForPoint: (point: T) => number;
}) {
  const max = Math.max(...points.map(valueForPoint), 0);

  return (
    <AdminPanel>
      <AdminPanelHeader subtitle={description} title={title} />
      <View className="gap-3">
        <View className="h-40 flex-row items-end gap-1">
          {points.map((point, index) => {
            const value = valueForPoint(point);
            const height = max <= 0 ? 4 : Math.max(8, (value / max) * 140);
            return (
              <View key={`${title}:${point.date_utc}`} className="min-w-0 flex-1 items-center gap-2">
                <View className="h-36 w-full justify-end rounded-xl bg-app-sunken/60 px-1 py-1">
                  <View
                    className="rounded-lg bg-app-brand"
                    style={{ height }}
                  />
                </View>
                <Text className="text-[10px] text-app-muted">
                  {showTickLabel(points.length, index) ? shortDate(point.date_utc) : ' '}
                </Text>
              </View>
            );
          })}
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <Text className="text-xs text-app-muted">Max</Text>
          <Text className="text-xs font-semibold text-app-ink">{valueFormatter(max)}</Text>
        </View>
      </View>
    </AdminPanel>
  );
}

function RecentSignupRow({
  compact = false,
  user,
}: {
  compact?: boolean;
  user: AdminAnalyticsUser;
}) {
  return (
    <WebCard padding="none" variant="sunken">
      <WebFieldRow
        className={compact ? 'gap-4 px-3 py-2.5' : 'px-4 py-3'}
        description={`Joined ${formatDateTime(user.created_at)} · Last seen ${formatDateTime(user.last_seen_at)}`}
        label={user.email}
        value={
          <View className="flex-row flex-wrap justify-end gap-2">
            <WebTag size="sm" variant={user.tier === 'pro' ? 'rose' : 'neutral'}>
              {user.tier}
            </WebTag>
            {user.subscription_status ? (
              <WebTag size="sm" variant="brand">
                {humanizeStatus(user.subscription_status)}
              </WebTag>
            ) : null}
          </View>
        }
      />
    </WebCard>
  );
}

function formatInteger(value: number): string {
  return value.toLocaleString();
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUsdCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function shortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function windowLabel(window: AdminAnalyticsWindow): string {
  switch (window) {
    case 'today':
      return 'Today';
    case '30d':
      return '30 days';
    default:
      return '7 days';
  }
}

function humanizeStatus(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function showTickLabel(total: number, index: number): boolean {
  if (total <= 7) return true;
  const step = total <= 14 ? 2 : total <= 21 ? 3 : 5;
  return index === 0 || index === total - 1 || index % step === 0;
}
