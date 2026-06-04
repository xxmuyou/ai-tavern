import { useState } from 'react';
import { Text, View } from 'react-native';

import type { AdminImageGenJob } from '@/api/types';
import { WebButton, WebLoading, WebTabs, WebTag } from '@/components/web/ui';
import { useAdminImageGenJobs } from '@/hooks/use-admin-image-gen-jobs';

import { AdminPanel, AdminPanelHeader } from './AdminPanel';

const FILTERS: { id: 'failed' | 'all'; label: string }[] = [
  { id: 'failed', label: 'Failed' },
  { id: 'all', label: 'All' },
];

/**
 * Read-only diagnostics: recent image generation jobs with their real provider
 * failure reason. Surfaces error_message (e.g. RunningHub NODE_INFO_MISMATCH)
 * so admins can debug without querying D1 by hand.
 */
export function ImageGenJobsSection() {
  const [filter, setFilter] = useState<'failed' | 'all'>('failed');
  const { jobs, isLoading, error, reload } = useAdminImageGenJobs(filter === 'all' ? null : filter, 50);

  return (
    <AdminPanel>
      <AdminPanelHeader
        subtitle="The real provider failure reason for each job. Use this to debug RunningHub errors (e.g. NODE_INFO_MISMATCH means a node id / field name in the config does not match the workflow)."
        title="Recent generation jobs"
      />

      <View className="flex-row items-center gap-2">
        <WebTabs
          active={filter}
          className="max-w-xs flex-1"
          onChange={(id) => setFilter(id as 'failed' | 'all')}
          size="sm"
          tabs={FILTERS}
          variant="pill"
        />
        <View className="ml-auto">
          <WebButton disabled={isLoading} label="Refresh" onPress={() => void reload()} size="sm" variant="outline" />
        </View>
      </View>

      {error ? <Text className="text-body-sm font-semibold text-rose-deep">{error}</Text> : null}

      {isLoading ? (
        <WebLoading fullscreen={false} label="Loading jobs..." />
      ) : (
        <View className="gap-2">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
          {jobs.length === 0 ? (
            <Text className="text-body-sm text-app-muted">No jobs to show.</Text>
          ) : null}
        </View>
      )}
    </AdminPanel>
  );
}

function JobRow({ job }: { job: AdminImageGenJob }) {
  const failed = job.status === 'failed' || job.status === 'cancelled';
  return (
    <View className="gap-1 rounded-xl border border-app-line bg-app-sunken/60 p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <WebTag size="sm" variant={failed ? 'danger' : 'neutral'}>
          {job.status}
        </WebTag>
        <Text className="text-caption text-app-muted">{job.task}</Text>
        {job.workflow_key ? (
          <Text className="text-caption text-app-muted">· {job.workflow_key}</Text>
        ) : null}
        {job.model ? <Text className="text-caption text-app-muted">· {job.model}</Text> : null}
        <Text className="ml-auto text-caption text-app-muted">{formatTime(job.created_at)}</Text>
      </View>
      {job.error_code ? (
        <Text className="text-caption font-semibold text-rose-deep">{job.error_code}</Text>
      ) : null}
      {job.error_message ? (
        <Text className="text-body-sm leading-5 text-app-ink">{job.error_message}</Text>
      ) : null}
      {job.provider_task_id ? (
        <Text className="text-[11px] text-app-muted">task {job.provider_task_id}</Text>
      ) : null}
    </View>
  );
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}
