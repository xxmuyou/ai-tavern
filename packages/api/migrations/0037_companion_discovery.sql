-- 0037: companion discovery + light social.
-- tags: JSON array of free-text tags for filtering/search.
-- play_count: how many users have started a chat with this companion (bumped
--   when a thread is first created). Drives the "popular" sort.
-- companion_favorites: a user's saved companions, for the "favorites" filter.
ALTER TABLE companions ADD COLUMN tags TEXT;
ALTER TABLE companions ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS companion_favorites (
  user_id      TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES companions(id),
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);

CREATE INDEX IF NOT EXISTS idx_companion_favorites_user ON companion_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_companions_play_count ON companions(play_count);
