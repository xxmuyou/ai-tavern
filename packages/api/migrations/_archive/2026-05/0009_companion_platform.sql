ALTER TABLE show_characters ADD COLUMN hard_preference_signals TEXT NOT NULL DEFAULT '[]';
ALTER TABLE show_characters ADD COLUMN soft_preference_signals TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS user_show_profiles (
  user_id TEXT NOT NULL,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  age_range TEXT NOT NULL DEFAULT '',
  occupation TEXT NOT NULL DEFAULT '',
  hobbies TEXT NOT NULL DEFAULT '[]',
  avatar_object_key TEXT,
  derived_tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, app_key, show_key)
);

CREATE TABLE IF NOT EXISTS user_companions (
  id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  character_key TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  unlock_status TEXT NOT NULL DEFAULT 'unlocked',
  relationship_state TEXT NOT NULL DEFAULT 'unlocked',
  story_turn_count INTEGER NOT NULL DEFAULT 0,
  last_story_at TEXT,
  snapshot TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, show_key, character_key)
);

CREATE TABLE IF NOT EXISTS companion_story_turns (
  id TEXT PRIMARY KEY,
  companion_id TEXT NOT NULL,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  scene_title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  selected_option_id TEXT,
  answer_text TEXT,
  response_text TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_user' CHECK (status IN ('awaiting_user', 'answered')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_companions_user
ON user_companions (user_id, app_key, show_key, updated_at);

CREATE INDEX IF NOT EXISTS idx_companion_story_turns_current
ON companion_story_turns (companion_id, user_id, status, turn_index);

UPDATE show_templates
SET
  premise = 'The user enters a companion-first AI TV show. The episode helps guests discover the user, and a successful hand-in-hand finale unlocks that character as a continuing date companion.',
  ending_rules = 'The final choice can unlock one continuing companion for solo date stories. The show should feel like the beginning of an ongoing relationship, not the end of a match.',
  config = '{"freeMessageLimit":8,"guestPreferenceEnabled":true,"finalChoiceMinMessages":3,"turnRoundsBeforeDeclaration":3,"freeCompanionStoryTurns":2}'
WHERE show_key = 'dating-heart-signal';

UPDATE show_characters
SET
  hard_preference_signals = '["creative_career","music_hobby","arts_hobby"]',
  soft_preference_signals = '["honesty","creativity","humor","warmth"]'
WHERE show_key = 'dating-heart-signal' AND character_key = 'mia';

UPDATE show_characters
SET
  hard_preference_signals = '["business_career","tech_career","stable_professional"]',
  soft_preference_signals = '["ambition","responsibility","maturity","stability"]'
WHERE show_key = 'dating-heart-signal' AND character_key = 'ivy';

UPDATE show_characters
SET
  hard_preference_signals = '["travel_hobby","creative_career","outdoor_hobby"]',
  soft_preference_signals = '["adventure","warmth","courage","creativity"]'
WHERE show_key = 'dating-heart-signal' AND character_key = 'leo';

UPDATE show_characters
SET
  hard_preference_signals = '["food_hobby","food_career","family_lifestyle"]',
  soft_preference_signals = '["kindness","family","stability","humor"]'
WHERE show_key = 'dating-heart-signal' AND character_key = 'noah';
