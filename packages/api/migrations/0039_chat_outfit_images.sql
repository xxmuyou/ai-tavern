-- spec-030: chat outfit images.
--
-- One-shot outfit image generations attached to a companion chat message. These
-- reuse image_generation_jobs for provider execution and keep a lightweight
-- per-message row for chat history / polling reconciliation.

CREATE TABLE chat_outfit_images (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  thread_id       TEXT NOT NULL REFERENCES threads(id),
  message_id      TEXT NOT NULL REFERENCES messages(id),
  prompt_source   TEXT NOT NULL,
  outfit_prompt   TEXT NOT NULL,
  prompt_snapshot TEXT NOT NULL,
  job_id          TEXT NOT NULL REFERENCES image_generation_jobs(id),
  output_key      TEXT,
  status          TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (user_id, message_id)
);

CREATE INDEX idx_chat_outfit_images_message ON chat_outfit_images (message_id);
CREATE INDEX idx_chat_outfit_images_job ON chat_outfit_images (job_id);
