-- spec-022: RunningHub async provider task tracking
ALTER TABLE companion_art_jobs ADD COLUMN external_task_id TEXT;

CREATE INDEX idx_companion_art_jobs_external_task_id
  ON companion_art_jobs(external_task_id);
