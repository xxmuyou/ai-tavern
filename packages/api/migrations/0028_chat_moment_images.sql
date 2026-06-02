-- spec-027: chat moment images.
--
-- Capture a single "this just happened" scene image from a companion reply that
-- carries scene context. The image is a full in-scene moment (not a portrait),
-- generated via the generic image_generation_jobs pipeline and pinned back to
-- the source message so it can be revisited.

-- Carry the activity a message belonged to, so a moment image can pull the full
-- activity context (type/hint/mood) at generation time. Nullable + backward
-- compatible: existing messages keep NULL.
ALTER TABLE messages ADD COLUMN activity_id TEXT;

CREATE TABLE story_moment_images (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  thread_id       TEXT NOT NULL REFERENCES threads(id),
  message_id      TEXT NOT NULL REFERENCES messages(id),
  scene_id        TEXT NOT NULL REFERENCES scenes(id),
  activity_id     TEXT REFERENCES activity_contexts(id),
  story_beat_id   TEXT REFERENCES companion_story_beats(id),
  emotion         TEXT,
  prompt_snapshot TEXT NOT NULL,
  job_id          TEXT NOT NULL REFERENCES image_generation_jobs(id),
  output_key      TEXT,
  status          TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (user_id, message_id)
);

CREATE INDEX idx_story_moment_images_message ON story_moment_images (message_id);
CREATE INDEX idx_story_moment_images_job ON story_moment_images (job_id);
