import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import type {
  AdminAnalyticsAcquisitionChannel,
  AdminAnalyticsBehaviorTopCompanion,
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
          subtitle="Window controls apply to new users, active users, revenue, behavior, acquisition, and top companions. Total users and membership mix are current snapshots."
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

      <View className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <MetricTablePanel
          rows={[
            { label: 'Visitors', value: overview.behavior.funnel.visitors },
            { label: 'Authenticated', value: overview.behavior.funnel.authenticated_users },
            { label: 'Signups', value: overview.behavior.funnel.signups },
            { label: 'Companion clickers', value: overview.behavior.funnel.companion_clickers },
            { label: 'Chat starters', value: overview.behavior.funnel.chat_starters },
            { label: 'First chats', value: overview.behavior.funnel.first_chat_starters },
            { label: '3-message users', value: overview.behavior.funnel.activated_chatters },
            { label: 'Message senders', value: overview.behavior.funnel.message_senders },
            { label: 'Checkout starters', value: overview.behavior.funnel.checkout_starters },
            { label: 'Purchasers', value: overview.behavior.funnel.purchasers },
          ]}
          subtitle={`Anonymous-to-user funnel for ${windowLabel(window).toLowerCase()}.`}
          title="Behavior funnel"
        />

        <MetricTablePanel
          rows={[
            { label: 'Page views', value: overview.behavior.event_counts.page_views },
            { label: 'Signups', value: overview.behavior.event_counts.signups },
            { label: 'Card clicks', value: overview.behavior.event_counts.companion_card_clicks },
            { label: 'Favorites', value: overview.behavior.event_counts.favorites },
            { label: 'First chats', value: overview.behavior.event_counts.chat_first_starts },
            { label: '3 messages', value: overview.behavior.event_counts.chat_3_messages },
            { label: 'Chat attempts', value: overview.behavior.event_counts.chat_attempts },
            { label: 'Chat successes', value: overview.behavior.event_counts.chat_successes },
            { label: 'Chat failures', value: overview.behavior.event_counts.chat_failures },
            { label: 'Checkout starts', value: overview.behavior.event_counts.billing_checkout_starts },
            { label: 'Checkout paid', value: overview.behavior.event_counts.billing_checkout_completions },
            { label: 'Credits bought', value: overview.behavior.event_counts.credits_purchased },
            { label: 'Subscriptions', value: overview.behavior.event_counts.subscription_starts },
          ]}
          subtitle={`Tracked event totals for ${windowLabel(window).toLowerCase()}.`}
          title="Key events"
        />
      </View>

      <AcquisitionPanel channels={overview.behavior.acquisition_channels} />

      <TopCompanionsPanel companions={overview.behavior.top_companions} />

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

function AcquisitionPanel({ channels }: { channels: AdminAnalyticsAcquisitionChannel[] }) {
  return (
    <AdminPanel>
      <AdminPanelHeader
        subtitle="Grouped by UTM source/campaign/term/content plus Google click id."
        title="Paid acquisition"
      />
      <View className="gap-2">
        {channels.length === 0 ? (
          <Text className="text-sm text-app-muted">No acquisition events yet.</Text>
        ) : (
          channels.map((channel) => (
            <WebCard key={`${channel.utm_source ?? 'direct'}:${channel.utm_campaign ?? ''}:${channel.utm_term ?? ''}:${channel.utm_content ?? ''}:${channel.google_click_id ?? ''}`} padding="none" variant="sunken">
              <WebFieldRow
                className="px-4 py-3"
                description={acquisitionDescription(channel)}
                label={channel.utm_campaign ?? channel.utm_source ?? 'Direct / unknown'}
                value={
                  <View className="flex-row flex-wrap justify-end gap-2">
                    <WebTag size="sm" variant="neutral">
                      {formatInteger(channel.visitors)} visits
                    </WebTag>
                    <WebTag size="sm" variant="brand">
                      {formatInteger(channel.signups)} signups
                    </WebTag>
                    <WebTag size="sm" variant="rose">
                      {formatInteger(channel.first_chat_starters)} chats
                    </WebTag>
                    <WebTag size="sm" variant="neutral">
                      {formatInteger(channel.activated_chatters)} 3-msg
                    </WebTag>
                    <WebTag size="sm" variant="brand">
                      {formatInteger(channel.purchasers)} paid
                    </WebTag>
                    <WebTag size="sm" variant="rose">
                      {formatUsd(channel.revenue_usd)}
                    </WebTag>
                  </View>
                }
              />
            </WebCard>
          ))
        )}
      </View>
    </AdminPanel>
  );
}

function TopCompanionsPanel({ companions }: { companions: AdminAnalyticsBehaviorTopCompanion[] }) {
  return (
    <AdminPanel>
      <AdminPanelHeader
        subtitle="Ranked by chat starts first, then clicks and favorites."
        title="Top companions"
      />
      <View className="gap-2">
        {companions.length === 0 ? (
          <Text className="text-sm text-app-muted">No companion behavior events yet.</Text>
        ) : (
          companions.map((companion) => (
            <WebCard key={companion.companion_id} padding="none" variant="sunken">
              <WebFieldRow
                className="px-4 py-3"
                description={[
                  companion.source ? humanizeStatus(companion.source) : null,
                  companion.gender ? humanizeStatus(companion.gender) : null,
                ].filter(Boolean).join(' · ') || 'Unknown companion attributes'}
                label={companion.companion_id}
                value={
                  <View className="flex-row flex-wrap justify-end gap-2">
                    <WebTag size="sm" variant="brand">
                      {formatInteger(companion.chat_starts)} chats
                    </WebTag>
                    <WebTag size="sm" variant="neutral">
                      {formatInteger(companion.clicks)} clicks
                    </WebTag>
                    <WebTag size="sm" variant="rose">
                      {formatInteger(companion.favorites)} favs
                    </WebTag>
                  </View>
                }
              />
            </WebCard>
          ))
        )}
      </View>
    </AdminPanel>
  );
}

function acquisitionDescription(channel: AdminAnalyticsAcquisitionChannel): string {
  return [
    channel.utm_source ? `source ${channel.utm_source}` : 'source direct/unknown',
    channel.utm_term ? `term ${channel.utm_term}` : null,
    channel.utm_content ? `content ${channel.utm_content}` : null,
    channel.google_click_id ? `click ${channel.google_click_id.slice(0, 18)}` : null,
    `checkouts ${formatInteger(channel.checkout_starters)}`,
  ].filter(Boolean).join(' · ');
}

function MetricTablePanel({
  rows,
  subtitle,
  title,
}: {
  rows: { label: string; value: number }[];
  subtitle: string;
  title: string;
}) {
  return (
    <AdminPanel>
      <AdminPanelHeader subtitle={subtitle} title={title} />
      <View className="overflow-hidden rounded-lg border border-app-line">
        <View className="grid grid-cols-[1fr_auto] bg-app-sunken/70 px-3 py-2">
          <Text className="text-[11px] font-semibold uppercase text-app-muted">Metric</Text>
          <Text className="text-right text-[11px] font-semibold uppercase text-app-muted">Count</Text>
        </View>
        {rows.map((row, index) => (
          <View
            key={`${title}:${row.label}`}
            className={`grid grid-cols-[1fr_auto] items-center px-3 py-2 ${index === 0 ? '' : 'border-t border-app-line'} ${index % 2 === 1 ? 'bg-app-sunken/35' : 'bg-app-card'}`}
          >
            <Text className="min-w-0 text-sm text-app-ink">{row.label}</Text>
            <Text className="pl-4 text-right text-sm font-semibold text-app-ink">{formatInteger(row.value)}</Text>
          </View>
        ))}
      </View>
    </AdminPanel>
  );
}

function SummaryPanel({
  children,
  items,
  subtitle,
  title,
}: {
  children?: ReactNode;
  items: { eyebrow: string; value: string }[];
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
