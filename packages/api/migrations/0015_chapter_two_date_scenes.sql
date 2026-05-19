CREATE TABLE IF NOT EXISTS chapter_two_date_sessions (
  id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  character_key TEXT NOT NULL,
  location_key TEXT NOT NULL CHECK (location_key IN ('cafe', 'cinema', 'bar')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  current_step_key TEXT NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapter_two_date_sessions_user
ON chapter_two_date_sessions (user_id, show_key, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_chapter_two_date_sessions_companion
ON chapter_two_date_sessions (companion_id, user_id, updated_at);

CREATE TABLE IF NOT EXISTS chapter_two_date_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  character_key TEXT NOT NULL,
  location_key TEXT NOT NULL,
  step_key TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  selected_option_id TEXT,
  answer_text TEXT,
  response_text TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_user' CHECK (status IN ('awaiting_user', 'answered')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chapter_two_date_turns_session_status
ON chapter_two_date_turns (session_id, user_id, status, turn_index);
