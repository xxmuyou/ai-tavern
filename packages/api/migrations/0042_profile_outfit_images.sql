-- spec-033: profile outfit images and per-user companion profile image overrides.

CREATE TABLE profile_outfit_images (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  prompt_source   TEXT NOT NULL,
  outfit_prompt   TEXT NOT NULL,
  prompt_snapshot TEXT NOT NULL,
  job_id          TEXT NOT NULL REFERENCES image_generation_jobs(id),
  output_key      TEXT,
  status          TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_profile_outfit_images_user_companion
  ON profile_outfit_images (user_id, companion_id, created_at);

CREATE UNIQUE INDEX idx_profile_outfit_images_job
  ON profile_outfit_images (job_id);

CREATE TABLE companion_profile_images (
  user_id              TEXT NOT NULL REFERENCES users(id),
  companion_id         TEXT NOT NULL REFERENCES companions(id),
  art_key              TEXT NOT NULL,
  source_generation_id TEXT REFERENCES profile_outfit_images(id),
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);

CREATE INDEX idx_companion_profile_images_art_key
  ON companion_profile_images (user_id, art_key);
