import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import type { AdminImageGenJob } from '@/api/types';
import { Button } from '@/components/Button';
import { useAdminImageGenJobs } from '@/hooks/use-admin-image-gen-jobs';

const FILTERS: { label: string; value: string | null }[] = [
  { label: 'Failed', value: 'failed' },
  { label: 'All', value: null },
];

/**
 * Read-only diagnostics: recent image generation jobs with their real provider
 * failure reason. Surfaces error_message (e.g. RunningHub NODE_INFO_MISMATCH)
 * so admins can debug without querying D1 by hand.
 */
export function ImageGenJobsSection() {
  const [status, setStatus] = useState<string | null>('failed');
  const { jobs, isLoading, error, reload } = useAdminImageGenJobs(status, 50);

  return (
    <View className="rounded-lg border border-app-line bg-white p-5">
      <Text className="text-lg font-semibold text-app-text">Recent generation jobs</Text>
      <Text className="mt-1 text-sm leading-6 text-app-muted">
        The real provider failure reason for each job. Use this to debug RunningHub errors
        (e.g. NODE_INFO_MISMATCH means a node id / field name in the WF1 config does not match
        the workflow).
      </Text>

      <View className="mt-3 flex-row items-center gap-2">
        {FILTERS.map((filter) => (
          <Pressable
            key={filter.label}
            accessibilityRole="button"
            onPress={() => setStatus(filter.value)}
            className={`rounded-full border px-3 py-2 ${
              status === filter.value ? 'border-app-primary bg-app-primary' : 'border-app-line bg-white'
            }`}
          >
            <Text
              className={`text-sm font-semibold ${status === filter.value ? 'text-white' : 'text-app-muted'}`}
            >
              {filter.label}
            </Text>
          </Pressable>
        ))}
        <View className="ml-auto w-24">
          <Button disabled={isLoading} label="Refresh" onPress={() => void reload()} variant="secondary" />
        </View>
      </View>

      {error ? <Text className="mt-3 text-sm font-semibold text-app-danger">{error}</Text> : null}

      {isLoading ? (
        <View className="items-center py-8">
          <ActivityIndicator color="#1E6B52" />
        </View>
      ) : (
        <View className="mt-4 gap-3">
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
          {jobs.length === 0 ? (
            <Text className="text-sm text-app-muted">No jobs to show.</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function JobRow({ job }: { job: AdminImageGenJob }) {
  const failed = job.status === 'failed' || job.status === 'cancelled';
  return (
    <View className="gap-1 rounded-lg border border-app-line bg-app-bg p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text
          className={`text-xs font-semibold ${failed ? 'text-app-danger' : 'text-app-text'}`}
        >
          {job.status}
        </Text>
        <Text className="text-xs text-app-muted">{job.task}</Text>
        {job.workflow_key ? (
          <Text className="text-xs text-app-muted">· {job.workflow_key}</Text>
        ) : null}
        {job.model ? <Text className="text-xs text-app-muted">· {job.model}</Text> : null}
        <Text className="ml-auto text-xs text-app-muted">{formatTime(job.created_at)}</Text>
      </View>
      {job.error_code ? (
        <Text className="text-xs font-semibold text-app-danger">{job.error_code}</Text>
      ) : null}
      {job.error_message ? (
        <Text className="text-xs leading-4 text-app-text">{job.error_message}</Text>
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
