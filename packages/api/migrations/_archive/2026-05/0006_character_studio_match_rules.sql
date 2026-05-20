ALTER TABLE show_characters ADD COLUMN owner_user_id TEXT;
ALTER TABLE show_characters ADD COLUMN source TEXT NOT NULL DEFAULT 'official';
ALTER TABLE show_characters ADD COLUMN positive_signals TEXT NOT NULL DEFAULT '[]';
ALTER TABLE show_characters ADD COLUMN negative_signals TEXT NOT NULL DEFAULT '[]';
ALTER TABLE show_characters ADD COLUMN dealbreaker_signals TEXT NOT NULL DEFAULT '[]';
ALTER TABLE show_characters ADD COLUMN blow_up_signals TEXT NOT NULL DEFAULT '[]';
ALTER TABLE show_characters ADD COLUMN match_threshold INTEGER NOT NULL DEFAULT 75;
ALTER TABLE show_characters ADD COLUMN initial_affinity INTEGER NOT NULL DEFAULT 50;

ALTER TABLE show_sessions ADD COLUMN initial_pick_character_key TEXT;
ALTER TABLE show_sessions ADD COLUMN user_profile TEXT NOT NULL DEFAULT '{}';
ALTER TABLE show_sessions ADD COLUMN user_declaration TEXT;
ALTER TABLE show_sessions ADD COLUMN match_success INTEGER NOT NULL DEFAULT 0;
ALTER TABLE show_sessions ADD COLUMN points_awarded INTEGER NOT NULL DEFAULT 0;

ALTER TABLE show_session_characters ADD COLUMN light_state TEXT NOT NULL DEFAULT 'on';
ALTER TABLE show_session_characters ADD COLUMN dealbreaker_triggered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE show_session_characters ADD COLUMN strong_signal_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS platform_point_events (
  id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL,
  show_key TEXT,
  session_id TEXT,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_show_characters_owner
ON show_characters (show_key, owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_platform_point_events_user
ON platform_point_events (user_id, created_at);

UPDATE show_characters
SET
  positive_signals = '["honesty","creativity","humor","shared_fun"]',
  negative_signals = '["arrogance","avoidance"]',
  dealbreaker_signals = '["contempt","aggression"]',
  blow_up_signals = '["honesty","creativity","humor"]',
  match_threshold = 75,
  initial_affinity = 52
WHERE show_key = 'dating-heart-signal' AND character_key = 'mia';

UPDATE show_characters
SET
  positive_signals = '["curiosity","responsibility","stability","maturity"]',
  negative_signals = '["chaos","empty_promises","avoidance"]',
  dealbreaker_signals = '["dishonesty","aggression"]',
  blow_up_signals = '["responsibility","maturity","ambition"]',
  match_threshold = 78,
  initial_affinity = 50
WHERE show_key = 'dating-heart-signal' AND character_key = 'ivy';

UPDATE show_characters
SET
  positive_signals = '["adventure","warmth","courage","creativity"]',
  negative_signals = '["controlling","cynicism"]',
  dealbreaker_signals = '["controlling","contempt"]',
  blow_up_signals = '["adventure","warmth","courage"]',
  match_threshold = 72,
  initial_affinity = 51
WHERE show_key = 'dating-heart-signal' AND character_key = 'leo';

UPDATE show_characters
SET
  positive_signals = '["kindness","family","stability","humor"]',
  negative_signals = '["rudeness","performative_coolness"]',
  dealbreaker_signals = '["rudeness","aggression"]',
  blow_up_signals = '["kindness","family","stability"]',
  match_threshold = 74,
  initial_affinity = 53
WHERE show_key = 'dating-heart-signal' AND character_key = 'noah';

DELETE FROM show_stages
WHERE show_key = 'dating-heart-signal';

INSERT OR IGNORE INTO show_stages (
  id,
  show_key,
  stage_key,
  title,
  stage_order,
  goal,
  host_instruction,
  allowed_user_actions,
  auto_advance_after_messages,
  is_final
) VALUES
  ('dating-heart-signal-initial-pick', 'dating-heart-signal', 'initial_pick', 'Initial pick', 10, 'Let the user privately choose one favorite guest without revealing hidden affinity.', 'Frame the choice as a secret first heartbeat. Do not reveal guest preferences or scores.', '["choose_initial_guest"]', NULL, 0),
  ('dating-heart-signal-profile-judgment', 'dating-heart-signal', 'profile_judgment', 'Profile judgment', 20, 'Guests evaluate the user profile against hard conditions and preferences.', 'Ask for age range, occupation, hobbies, lifestyle, and relationship values. Then announce only visible light states.', '["submit_profile"]', NULL, 0),
  ('dating-heart-signal-guest-questions', 'dating-heart-signal', 'guest_questions', 'Guest questions', 30, 'Interested guests ask the user questions. Answers affect all remaining guests.', 'Let a high-affinity guest ask one focused question, then react as the room shifts.', '["answer_guest_question"]', NULL, 0),
  ('dating-heart-signal-user-declaration', 'dating-heart-signal', 'user_declaration', 'User declaration', 40, 'The user states what they like and dislike in a partner.', 'Give the user a stage speech moment and summarize the room reaction afterward.', '["declare_preferences"]', NULL, 0),
  ('dating-heart-signal-final-choice', 'dating-heart-signal', 'final_choice', 'Final choice', 50, 'The user chooses one available guest. Mutual compatibility decides success.', 'Raise the stakes and invite one final choice among guests whose light is still on or blown up.', '["choose_guest","walk_away"]', NULL, 0),
  ('dating-heart-signal-completed', 'dating-heart-signal', 'completed', 'Finale', 60, 'Summarize the ending and award points for a successful mutual match.', 'Deliver a satisfying finale based on whether both sides matched.', '[]', NULL, 1);
