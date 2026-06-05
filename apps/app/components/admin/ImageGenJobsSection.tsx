import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import type { AdminImageGenJob } from '@/api/types';
import { WebButton, WebDialog, WebLoading, WebTabs, WebTag } from '@/components/web/ui';
import { useAdminImageGenJobs } from '@/hooks/use-admin-image-gen-jobs';

import { AdminPanel, AdminPanelHeader } from './AdminPanel';

const FILTERS: { id: 'failed' | 'all'; label: string }[] = [
  { id: 'failed', label: 'Failed' },
  { id: 'all', label: 'All' },
];

export function ImageGenJobsSection() {
  const [open, setOpen] = useState(false);

  return (
    <AdminPanel>
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <AdminPanelHeader
          subtitle="Open a day-bounded diagnostic log when image generation needs debugging."
          title="Generation logs"
        />
        <WebButton label="View logs" onPress={() => setOpen(true)} size="sm" variant="outline" />
      </View>
      <ImageGenJobsDialog onClose={() => setOpen(false)} open={open} />
    </AdminPanel>
  );
}

function ImageGenJobsDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
  const [filter, setFilter] = useState<'failed' | 'all'>('failed');
  const [dateText, setDateText] = useState(() => formatDateInput(new Date()));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const range = useMemo(() => dayRangeFromInput(dateText), [dateText]);
  const { jobs, isLoading, error, reload } = useAdminImageGenJobs({
    createdFrom: range?.from,
    createdTo: range?.to,
    limit: 80,
    status: filter === 'all' ? null : filter,
  });

  return (
    <WebDialog
      description="Day-bounded image generation diagnostics. Rows start compact; select one to inspect the provider details."
      onClose={onClose}
      open={open}
      size="lg"
      title="Generation logs"
    >
      <View className="gap-4">
        <View className="flex-row flex-wrap items-end gap-3">
          <View className="min-w-[180px] flex-1 gap-1.5">
            <Text className="text-caption font-semibold text-app-ink-soft">Local day</Text>
            <TextInput
              accessibilityLabel="Generation log date"
              className="min-h-10 rounded-lg border border-app-line bg-app-surface px-3 text-sm text-app-ink"
              onChangeText={setDateText}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#8F7F76"
              value={dateText}
            />
          </View>
          <WebTabs
            active={filter}
            className="min-w-[180px] flex-1"
            onChange={(id) => {
              setFilter(id as 'failed' | 'all');
              setExpandedId(null);
            }}
            size="sm"
            tabs={FILTERS}
            variant="pill"
          />
          <WebButton disabled={isLoading || !range} label="Refresh" onPress={() => void reload()} size="sm" variant="outline" />
        </View>

        {!range ? <Text className="text-body-sm font-semibold text-rose-deep">Use YYYY-MM-DD.</Text> : null}
        {error ? <Text className="text-body-sm font-semibold text-rose-deep">{error}</Text> : null}

        {isLoading ? (
          <WebLoading fullscreen={false} label="Loading jobs..." />
        ) : (
          <ScrollView className="max-h-[520px]">
            <View className="gap-2">
              {jobs.map((job) => (
                <JobRow
                  expanded={expandedId === job.id}
                  job={job}
                  key={job.id}
                  onToggle={() => setExpandedId((current) => (current === job.id ? null : job.id))}
                />
              ))}
              {jobs.length === 0 ? (
                <Text className="text-body-sm text-app-muted">No jobs to show for this day.</Text>
              ) : null}
            </View>
          </ScrollView>
        )}
      </View>
    </WebDialog>
  );
}

function JobRow({ expanded, job, onToggle }: { expanded: boolean; job: AdminImageGenJob; onToggle: () => void }) {
  const failed = job.status === 'failed' || job.status === 'cancelled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onToggle}
      className="gap-2 rounded-xl border border-app-line bg-app-sunken/60 p-3 hover:bg-rose-soft/50"
    >
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
      {expanded ? (
        <View className="gap-1 border-t border-app-line-soft pt-2">
          <Detail label="provider" value={job.provider} />
          <Detail label="model" value={job.model} />
          <Detail label="provider task" value={job.provider_task_id} />
          <Detail label="completed" value={job.completed_at ? formatTime(job.completed_at) : null} />
          <Detail label="error" value={job.error_message} />
          <Detail label="prompt" value={job.prompt_excerpt} />
        </View>
      ) : null}
    </Pressable>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View>
      <Text className="text-[11px] font-semibold uppercase text-app-muted">{label}</Text>
      <Text className="text-body-sm leading-5 text-app-ink">{value}</Text>
    </View>
  );
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayRangeFromInput(value: string): { from: number; to: number } | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(year, month - 1, day);
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
    return null;
  }
  const end = new Date(year, month - 1, day + 1);
  return { from: start.getTime(), to: end.getTime() };
}

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}
