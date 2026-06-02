-- 0032: fix story_moment_images.scene_id nullability (dev schema drift from 0029).
--
-- The dev D1 was created from an early 0029 where scene_id was NOT NULL. The
-- source was later corrected to a nullable scene_id (private-chat moments carry
-- no scene), but an already-applied migration never re-runs, so the live table
-- kept NOT NULL. That made every capture on a sceneless companion message throw
-- on INSERT, which silently aborted createMomentImageJob before it enqueued —
-- leaving the job stuck `pending` forever and the UI stuck on "Try again".
--
-- SQLite can't drop a NOT NULL in place, so rebuild the table with the correct
-- (nullable) scene_id. Idempotent in effect: where the table is already nullable
-- (fresh applies of 0029), this rebuilds to the identical shape. Nothing
-- references this table, so DROP/RENAME is safe.

CREATE TABLE story_moment_images_new (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  thread_id       TEXT NOT NULL REFERENCES threads(id),
  message_id      TEXT NOT NULL REFERENCES messages(id),
  scene_id        TEXT REFERENCES scenes(id),
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

INSERT INTO story_moment_images_new
  (id, user_id, companion_id, thread_id, message_id, scene_id, activity_id,
   story_beat_id, emotion, prompt_snapshot, job_id, output_key, status,
   created_at, updated_at)
SELECT
   id, user_id, companion_id, thread_id, message_id, scene_id, activity_id,
   story_beat_id, emotion, prompt_snapshot, job_id, output_key, status,
   created_at, updated_at
FROM story_moment_images;

DROP TABLE story_moment_images;

ALTER TABLE story_moment_images_new RENAME TO story_moment_images;

CREATE INDEX idx_story_moment_images_message ON story_moment_images (message_id);
CREATE INDEX idx_story_moment_images_job ON story_moment_images (job_id);
