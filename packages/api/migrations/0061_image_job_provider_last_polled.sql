-- Track active provider status/output checks separately from job lifecycle
-- updates so pending polls do not extend the hard timeout window.
ALTER TABLE image_generation_jobs ADD COLUMN provider_last_polled_at INTEGER;
