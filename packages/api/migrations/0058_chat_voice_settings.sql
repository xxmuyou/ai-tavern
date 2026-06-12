-- 0058: per-user chat voice settings and voice generation credit records.
--
-- Voice selection in chat is a user preference, not a companion-global edit.
-- This lets each user tune official and user-created companions without
-- affecting anyone else's experience.
CREATE TABLE IF NOT EXISTS user_companion_voice_settings (
  user_id       TEXT NOT NULL REFERENCES users(id),
  companion_id  TEXT NOT NULL REFERENCES companions(id),
  voice_id      TEXT NOT NULL,
  voice_speed   TEXT NOT NULL DEFAULT 'medium',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);

CREATE INDEX IF NOT EXISTS idx_user_companion_voice_settings_companion
  ON user_companion_voice_settings(companion_id);

-- Successful first-time voice generations are recorded here so replaying the
-- same generated clip is free for that user, while changing voice/speed for the
-- same message can be charged independently.
CREATE TABLE IF NOT EXISTS voice_generation_charges (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  message_id      TEXT NOT NULL REFERENCES messages(id),
  voice_id        TEXT NOT NULL,
  voice_speed     TEXT NOT NULL,
  reservation_id  TEXT,
  created_at      INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_generation_charges_unique
  ON voice_generation_charges(user_id, companion_id, message_id, voice_id, voice_speed);

CREATE INDEX IF NOT EXISTS idx_voice_generation_charges_user_time
  ON voice_generation_charges(user_id, created_at);
