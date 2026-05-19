CREATE TABLE IF NOT EXISTS user_guest_assets (
  id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  character_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('official', 'community', 'user')),
  acquisition_method TEXT NOT NULL CHECK (
    acquisition_method IN ('joined_home', 'community_added', 'system_default', 'created', 'unlocked')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, show_key, character_key)
);

CREATE INDEX IF NOT EXISTS idx_user_guest_assets_user
ON user_guest_assets (user_id, show_key, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_user_guest_assets_character
ON user_guest_assets (show_key, character_key, status);
