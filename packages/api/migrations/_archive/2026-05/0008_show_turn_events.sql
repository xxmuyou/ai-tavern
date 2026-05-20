CREATE TABLE IF NOT EXISTS show_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  speaker_key TEXT,
  speaker_name TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '[]',
  selected_option_id TEXT,
  selected_character_key TEXT,
  answer_text TEXT,
  status TEXT NOT NULL DEFAULT 'awaiting_user' CHECK (status IN ('awaiting_user', 'answered', 'skipped')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS show_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  turn_id TEXT,
  event_order INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  speaker_key TEXT,
  speaker_name TEXT NOT NULL,
  content TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_show_turns_session_status
ON show_turns (session_id, user_id, status, turn_index);

CREATE INDEX IF NOT EXISTS idx_show_events_session_order
ON show_events (session_id, user_id, event_order);

UPDATE show_templates
SET
  premise = 'The user is the lead participant in a studio dating game. A host controls the rhythm, guests actively ask questions, and every answer can trigger public reactions, lights off, or blow-up moments.',
  opening_scene = 'Welcome to Heart Signal Live. Tonight, the guests will not wait for you to carry the room: they ask, you answer, and every light reacts in real time.',
  config = '{"freeMessageLimit":8,"guestPreferenceEnabled":true,"finalChoiceMinMessages":3,"turnRoundsBeforeDeclaration":3}'
WHERE show_key = 'dating-heart-signal';

UPDATE show_characters
SET
  positive_signals = '["honesty","creativity","humor","shared_fun","warmth"]',
  negative_signals = '["arrogance","avoidance","rudeness"]',
  dealbreaker_signals = '["contempt","aggression","boundary_violation"]',
  blow_up_signals = '["honesty","creativity","humor","warmth"]'
WHERE show_key = 'dating-heart-signal' AND character_key = 'mia';

UPDATE show_characters
SET
  positive_signals = '["curiosity","responsibility","stability","maturity","ambition"]',
  negative_signals = '["chaos","empty_promises","avoidance","performative_coolness"]',
  dealbreaker_signals = '["dishonesty","aggression","boundary_violation"]',
  blow_up_signals = '["responsibility","maturity","ambition"]'
WHERE show_key = 'dating-heart-signal' AND character_key = 'ivy';

UPDATE show_characters
SET
  positive_signals = '["adventure","warmth","courage","creativity","humor"]',
  negative_signals = '["controlling","cynicism","materialism"]',
  dealbreaker_signals = '["controlling","contempt","boundary_violation"]',
  blow_up_signals = '["adventure","warmth","courage"]'
WHERE show_key = 'dating-heart-signal' AND character_key = 'leo';

UPDATE show_characters
SET
  positive_signals = '["kindness","family","stability","humor","responsibility"]',
  negative_signals = '["rudeness","performative_coolness","materialism"]',
  dealbreaker_signals = '["rudeness","aggression","boundary_violation"]',
  blow_up_signals = '["kindness","family","stability"]'
WHERE show_key = 'dating-heart-signal' AND character_key = 'noah';
