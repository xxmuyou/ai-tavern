-- Permanent user-level scene unlocks.
--
-- A scene unlocked through any companion relationship becomes available to the
-- user across all companions, even if the source relationship later decays.

CREATE TABLE IF NOT EXISTS user_scene_unlocks (
  user_id             TEXT    NOT NULL REFERENCES users(id),
  scene_id            TEXT    NOT NULL REFERENCES scenes(id),
  unlocked_at         INTEGER NOT NULL,
  source_companion_id TEXT    REFERENCES companions(id),
  PRIMARY KEY (user_id, scene_id)
);

CREATE INDEX IF NOT EXISTS idx_user_scene_unlocks_user
  ON user_scene_unlocks (user_id);
