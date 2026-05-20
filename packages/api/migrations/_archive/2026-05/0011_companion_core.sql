INSERT OR IGNORE INTO apps (app_key, name, status, sort_order)
VALUES ('ai-companion', 'AI Companion', 'active', 1);

CREATE TABLE IF NOT EXISTS dimension_definitions (
  dimension_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  value_type TEXT NOT NULL CHECK (value_type IN ('number', 'string', 'string_list', 'json')),
  min_value REAL,
  max_value REAL,
  default_value TEXT NOT NULL DEFAULT '0',
  applies_to TEXT NOT NULL CHECK (applies_to IN ('character', 'relationship', 'both')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'retired')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS character_cards (
  id TEXT PRIMARY KEY,
  character_key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('private', 'public')),
  is_default_version INTEGER NOT NULL DEFAULT 0,
  owner_user_id TEXT,
  display_name TEXT NOT NULL,
  identity_json TEXT NOT NULL DEFAULT '{}',
  persona_json TEXT NOT NULL DEFAULT '{}',
  style_json TEXT NOT NULL DEFAULT '{}',
  assets_json TEXT NOT NULL DEFAULT '{}',
  public_profile_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (character_key, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_character_cards_default
ON character_cards (character_key)
WHERE is_default_version = 1;

CREATE INDEX IF NOT EXISTS idx_character_cards_public
ON character_cards (status, visibility, is_default_version, display_name);

CREATE TABLE IF NOT EXISTS character_dimension_values (
  character_card_id TEXT NOT NULL,
  dimension_key TEXT NOT NULL,
  value_json TEXT NOT NULL DEFAULT 'null',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (character_card_id, dimension_key)
);

CREATE TABLE IF NOT EXISTS user_character_relationships (
  id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL DEFAULT 'ai-companion',
  user_id TEXT NOT NULL,
  character_key TEXT NOT NULL,
  character_card_id TEXT NOT NULL,
  character_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, character_key)
);

CREATE INDEX IF NOT EXISTS idx_relationships_user
ON user_character_relationships (user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS relationship_dimension_values (
  relationship_id TEXT NOT NULL,
  dimension_key TEXT NOT NULL,
  value_number REAL,
  value_json TEXT NOT NULL DEFAULT 'null',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (relationship_id, dimension_key)
);

CREATE TABLE IF NOT EXISTS relationship_events (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL,
  scene_session_id TEXT,
  scene_turn_id TEXT,
  event_type TEXT NOT NULL,
  signals_json TEXT NOT NULL DEFAULT '[]',
  dimension_deltas_json TEXT NOT NULL DEFAULT '{}',
  memory_text TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_relationship_events_relationship
ON relationship_events (relationship_id, created_at);

CREATE TABLE IF NOT EXISTS scene_packs (
  id TEXT PRIMARY KEY,
  scene_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  genre TEXT NOT NULL DEFAULT 'companion',
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'retired')),
  ui_labels_json TEXT NOT NULL DEFAULT '{}',
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scene_packs_active
ON scene_packs (status, title);

CREATE TABLE IF NOT EXISTS scene_steps (
  id TEXT PRIMARY KEY,
  scene_key TEXT NOT NULL,
  step_key TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  speaker_mode TEXT NOT NULL DEFAULT 'character' CHECK (speaker_mode IN ('character', 'narrator')),
  prompt_template TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  relationship_effects_json TEXT NOT NULL DEFAULT '{}',
  is_terminal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (scene_key, step_key)
);

CREATE INDEX IF NOT EXISTS idx_scene_steps_pack
ON scene_steps (scene_key, step_order);

CREATE TABLE IF NOT EXISTS scene_sessions (
  id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL DEFAULT 'ai-companion',
  scene_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  character_key TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  current_step_key TEXT NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scene_sessions_user
ON scene_sessions (user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS scene_turns (
  id TEXT PRIMARY KEY,
  scene_session_id TEXT NOT NULL,
  app_key TEXT NOT NULL DEFAULT 'ai-companion',
  user_id TEXT NOT NULL,
  character_key TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  scene_key TEXT NOT NULL,
  step_key TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  selected_option_id TEXT,
  answer_text TEXT,
  response_text TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_user' CHECK (status IN ('awaiting_user', 'answered')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scene_turns_session_status
ON scene_turns (scene_session_id, status, turn_index);

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO dimension_definitions (
  dimension_key, label, description, value_type, min_value, max_value, default_value, applies_to, sort_order
) VALUES
  ('affection', 'Affection', 'Warmth and romantic/emotional pull toward the user.', 'number', 0, 100, '35', 'relationship', 10),
  ('trust', 'Trust', 'How safe and reliable the user feels to the character.', 'number', 0, 100, '35', 'relationship', 20),
  ('intimacy', 'Intimacy', 'Depth of personal closeness earned through interactions.', 'number', 0, 100, '10', 'relationship', 30),
  ('dependency', 'Dependency', 'How emotionally present and recurring the bond feels.', 'number', 0, 100, '5', 'relationship', 40),
  ('tension', 'Tension', 'Conflict, charge, or unresolved friction.', 'number', 0, 100, '10', 'relationship', 50),
  ('curiosity', 'Curiosity', 'How much the character wants to know more.', 'number', 0, 100, '45', 'relationship', 60),
  ('caution', 'Caution', 'Defensiveness or guardedness caused by weak signals or red flags.', 'number', 0, 100, '15', 'relationship', 70),
  ('personality', 'Personality', 'Stable personality descriptors for a character card.', 'string_list', NULL, NULL, '[]', 'character', 110),
  ('preferences', 'Preferences', 'Signals this character tends to respond well to.', 'string_list', NULL, NULL, '[]', 'character', 120),
  ('boundaries', 'Boundaries', 'Topics or behaviors that should increase caution or stop progress.', 'string_list', NULL, NULL, '[]', 'character', 130),
  ('speaking_style', 'Speaking style', 'Short description of the character voice.', 'string', NULL, NULL, '""', 'character', 140);

INSERT OR IGNORE INTO character_cards (
  id, character_key, version, status, visibility, is_default_version, display_name,
  identity_json, persona_json, style_json, assets_json, public_profile_json
) VALUES
  (
    'character-mia-v1',
    'mia',
    1,
    'active',
    'public',
    1,
    'Mia',
    '{"name":"Mia","gender":"female","ageRange":"25-30","occupation":"indie musician","hobbies":["music","late-night walks","small live shows"]}',
    '{"backstory":"Mia learned to read people through tiny pauses between songs.","goal":"Find someone honest enough to be imperfect out loud.","hiddenPreferences":"specific memories, humor that does not punch down, emotional presence","boundaries":"No contempt, pressure, or fake confidence."}',
    '{"speakingStyle":"warm, teasing, concise","toneTags":["playful","direct","observant"]}',
    '{"avatarObjectKey":null,"portraitObjectKey":null,"galleryObjectKeys":[]}',
    '{"tagline":"Direct, playful, emotionally observant.","tags":["musician","playful","honest"]}'
  ),
  (
    'character-noah-v1',
    'noah',
    1,
    'active',
    'public',
    1,
    'Noah',
    '{"name":"Noah","gender":"male","ageRange":"30-36","occupation":"chef and cafe owner","hobbies":["coffee","cooking","quiet routines"]}',
    '{"backstory":"Noah trusts care that survives ordinary days.","goal":"Learn whether the user can make daily life feel safe and alive.","hiddenPreferences":"kindness, practical romance, consistency","boundaries":"No rudeness, aggression, or performative coolness."}',
    '{"speakingStyle":"grounded, witty, sincere","toneTags":["attentive","steady","humorous"]}',
    '{"avatarObjectKey":null,"portraitObjectKey":null,"galleryObjectKeys":[]}',
    '{"tagline":"Grounded, humorous, attentive.","tags":["chef","steady","kind"]}'
  );

INSERT OR IGNORE INTO character_dimension_values (character_card_id, dimension_key, value_json, visibility) VALUES
  ('character-mia-v1', 'personality', '["direct","playful","emotionally_observant"]', 'public'),
  ('character-mia-v1', 'preferences', '["honesty","creativity","humor","warmth","specificity"]', 'private'),
  ('character-mia-v1', 'boundaries', '["contempt","aggression","emotional_pressure","fake_confidence"]', 'private'),
  ('character-mia-v1', 'speaking_style', '"warm, teasing, concise"', 'public'),
  ('character-noah-v1', 'personality', '["grounded","humorous","attentive"]', 'public'),
  ('character-noah-v1', 'preferences', '["kindness","stability","family","humor","care"]', 'private'),
  ('character-noah-v1', 'boundaries', '["rudeness","aggression","performative_coolness"]', 'private'),
  ('character-noah-v1', 'speaking_style', '"down-to-earth, witty, sincere"', 'public');

INSERT OR IGNORE INTO scene_packs (
  id, scene_key, title, genre, summary, status, ui_labels_json, config_json
) VALUES
  (
    'scene-late-night-checkin',
    'late-night-checkin',
    'Late Night Check-in',
    'daily_companion',
    'A quiet first scene where the user and character test emotional rhythm without a fixed dating-show frame.',
    'active',
    '{"startCta":"Start check-in","answerPlaceholder":"Write what you would say...","eventTitle":"Relationship movement","sessionTitle":"Shared moment"}',
    '{"maxTurns":3}'
  );

INSERT OR IGNORE INTO scene_steps (
  id, scene_key, step_key, step_order, speaker_mode, prompt_template, options_json, relationship_effects_json, is_terminal
) VALUES
  (
    'late-night-checkin-opening',
    'late-night-checkin',
    'opening',
    10,
    'character',
    '{{characterName}} sends a quiet message after the day slows down: "What part of today stayed with you longer than you expected?"',
    '[{"id":"honest_detail","label":"Honest detail","preview":"I answer with one specific moment instead of a polished summary.","signals":["honesty","specificity"],"relationshipEffects":{"trust":6,"curiosity":5,"affection":4}},{"id":"playful_deflect","label":"Playful deflect","preview":"I keep it light and invite a smile before going deeper.","signals":["humor","warmth"],"relationshipEffects":{"affection":5,"curiosity":3,"tension":1}},{"id":"guarded","label":"Guarded","preview":"I admit I am not ready to unpack it yet, but I do not disappear.","signals":["boundary","honesty"],"relationshipEffects":{"trust":3,"caution":2,"intimacy":1}}]',
    '{}',
    0
  ),
  (
    'late-night-checkin-listen',
    'late-night-checkin',
    'listen',
    20,
    'character',
    '{{characterName}} stays with the answer and asks what kind of care would actually help tonight.',
    '[{"id":"ask_for_presence","label":"Ask for presence","preview":"I say I do not need fixing, just someone who stays present.","signals":["care","honesty"],"relationshipEffects":{"trust":6,"intimacy":5,"dependency":3}},{"id":"make_it_funny","label":"Make it funny","preview":"I turn the feeling into a small joke without denying it.","signals":["humor","warmth"],"relationshipEffects":{"affection":5,"tension":-2,"curiosity":3}},{"id":"test_boundary","label":"Name a boundary","preview":"I name one boundary that would make closeness feel safer.","signals":["boundary","specificity"],"relationshipEffects":{"trust":5,"caution":-3,"intimacy":3}}]',
    '{}',
    0
  ),
  (
    'late-night-checkin-close',
    'late-night-checkin',
    'close',
    30,
    'character',
    '{{characterName}} lets the conversation settle and asks what the next small ritual between you two should be.',
    '[{"id":"daily_ritual","label":"Daily ritual","preview":"I suggest a small recurring check-in that feels easy to keep.","signals":["stability","care"],"relationshipEffects":{"dependency":5,"trust":4,"affection":3}},{"id":"slow_burn","label":"Slow burn","preview":"I say I want us to earn closeness slowly and remember the details.","signals":["patience","honesty"],"relationshipEffects":{"intimacy":5,"trust":4,"curiosity":2}},{"id":"bold_invite","label":"Bold invite","preview":"I clearly say I want another scene with this energy.","signals":["courage","warmth"],"relationshipEffects":{"affection":7,"tension":2,"curiosity":3}}]',
    '{}',
    1
  );
