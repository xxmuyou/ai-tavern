INSERT OR IGNORE INTO apps (app_key, name, status, sort_order)
VALUES ('ai-tv-dating', 'AI TV Dating Show', 'active', 1);

UPDATE apps
SET status = 'hidden'
WHERE app_key IN ('sample-focus', 'sample-arcade');

CREATE TABLE IF NOT EXISTS ai_tv_dating_guest_templates (
  id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL DEFAULT 'ai-tv-dating',
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
  age_range TEXT NOT NULL,
  occupation_tag TEXT NOT NULL,
  personality_keywords TEXT NOT NULL,
  preferences TEXT NOT NULL,
  dealbreakers TEXT NOT NULL,
  speaking_style TEXT NOT NULL,
  avatar_object_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'retired')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_tv_dating_sessions (
  id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  avatar_object_key TEXT,
  avatar_label TEXT NOT NULL,
  guest_preference TEXT NOT NULL CHECK (guest_preference IN ('male', 'female', 'any')),
  current_stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  selected_guest_template_id TEXT,
  result_summary TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_tv_dating_session_guests (
  session_id TEXT NOT NULL,
  app_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  guest_template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  profile_snapshot TEXT NOT NULL,
  affection_score INTEGER NOT NULL DEFAULT 50,
  is_available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, guest_template_id)
);

CREATE TABLE IF NOT EXISTS ai_tv_dating_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  app_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'host', 'guest', 'system')),
  speaker_id TEXT,
  speaker_name TEXT NOT NULL,
  content TEXT NOT NULL,
  stage TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_tv_dating_sessions_user
ON ai_tv_dating_sessions (app_key, user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_ai_tv_dating_messages_session
ON ai_tv_dating_messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_tv_dating_guest_templates_active
ON ai_tv_dating_guest_templates (app_key, status, gender, sort_order);

INSERT OR IGNORE INTO ai_tv_dating_guest_templates (
  id,
  name,
  gender,
  age_range,
  occupation_tag,
  personality_keywords,
  preferences,
  dealbreakers,
  speaking_style,
  avatar_object_key,
  sort_order
) VALUES
  (
    'mia',
    'Mia',
    'female',
    '25-30',
    'indie musician',
    'direct, playful, emotionally observant',
    'creative people, honest communication, shared humor',
    'arrogance, emotional avoidance',
    'warm, teasing, concise',
    'apps/ai-tv-dating/guests/mia.png',
    10
  ),
  (
    'ivy',
    'Ivy',
    'female',
    '28-34',
    'startup product lead',
    'sharp, calm, ambitious',
    'curiosity, reliability, emotional maturity',
    'empty promises, chaos addiction',
    'precise, composed, lightly challenging',
    'apps/ai-tv-dating/guests/ivy.png',
    20
  ),
  (
    'leo',
    'Leo',
    'male',
    '26-32',
    'travel photographer',
    'open, romantic, spontaneous',
    'warmth, courage, shared adventure',
    'controlling behavior, cynicism',
    'cinematic, gentle, optimistic',
    'apps/ai-tv-dating/guests/leo.png',
    30
  ),
  (
    'noah',
    'Noah',
    'male',
    '30-36',
    'chef and cafe owner',
    'grounded, humorous, attentive',
    'kindness, practical romance, family values',
    'rudeness, performative coolness',
    'down-to-earth, witty, sincere',
    'apps/ai-tv-dating/guests/noah.png',
    40
  );
