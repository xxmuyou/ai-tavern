CREATE TABLE IF NOT EXISTS show_templates (
  show_key TEXT PRIMARY KEY,
  app_key TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  show_type TEXT NOT NULL,
  premise TEXT NOT NULL,
  background_image_key TEXT,
  opening_scene TEXT NOT NULL,
  ending_rules TEXT NOT NULL,
  default_avatar_options TEXT NOT NULL DEFAULT '[]',
  config TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'retired')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS show_characters (
  id TEXT PRIMARY KEY,
  show_key TEXT NOT NULL,
  character_key TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'guest', 'support')),
  name TEXT NOT NULL,
  gender TEXT,
  avatar_object_key TEXT,
  personality TEXT NOT NULL,
  goal TEXT NOT NULL,
  boundaries TEXT NOT NULL,
  speaking_style TEXT NOT NULL,
  relationship_to_user TEXT NOT NULL,
  hidden_preferences TEXT NOT NULL DEFAULT '',
  public_profile TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'retired')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (show_key, character_key)
);

CREATE TABLE IF NOT EXISTS show_stages (
  id TEXT PRIMARY KEY,
  show_key TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  title TEXT NOT NULL,
  stage_order INTEGER NOT NULL,
  goal TEXT NOT NULL,
  host_instruction TEXT NOT NULL,
  allowed_user_actions TEXT NOT NULL DEFAULT '[]',
  auto_advance_after_messages INTEGER,
  is_final INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (show_key, stage_key)
);

CREATE TABLE IF NOT EXISTS show_sessions (
  id TEXT PRIMARY KEY,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  avatar_object_key TEXT,
  avatar_label TEXT NOT NULL,
  audience_preference TEXT NOT NULL DEFAULT 'any',
  current_stage_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  selected_character_key TEXT,
  result_summary TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS show_session_characters (
  session_id TEXT NOT NULL,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  character_key TEXT NOT NULL,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  affinity_score INTEGER NOT NULL DEFAULT 50,
  is_available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id, character_key)
);

CREATE TABLE IF NOT EXISTS show_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  app_key TEXT NOT NULL,
  show_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'host', 'character', 'system')),
  speaker_key TEXT,
  speaker_name TEXT NOT NULL,
  content TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_show_templates_app_status
ON show_templates (app_key, status, sort_order);

CREATE INDEX IF NOT EXISTS idx_show_characters_show_active
ON show_characters (show_key, status, role, sort_order);

CREATE INDEX IF NOT EXISTS idx_show_stages_show_order
ON show_stages (show_key, stage_order);

CREATE INDEX IF NOT EXISTS idx_show_sessions_user
ON show_sessions (app_key, show_key, user_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_show_messages_session
ON show_messages (session_id, created_at);

INSERT OR IGNORE INTO show_templates (
  show_key,
  app_key,
  title,
  subtitle,
  show_type,
  premise,
  background_image_key,
  opening_scene,
  ending_rules,
  default_avatar_options,
  config,
  sort_order
) VALUES (
  'dating-heart-signal',
  'ai-tv-dating',
  'AI TV Dating Show',
  'Heart Signal Live',
  'dating',
  'The user is the lead participant in a studio dating show. A host guides the episode while guests react to the user through playful, non-explicit romantic conversation.',
  'apps/ai-tv-dating/backgrounds/studio.png',
  'Welcome to Heart Signal Live. Tonight, you are the lead guest. Meet the lineup, trust your instincts, and decide who deserves the final spotlight.',
  'The user may choose one guest as the final match or walk away from everyone. The ending should feel like a TV show finale and remain non-explicit.',
  '[{"label":"Spotlight Guest","objectKey":"apps/ai-tv-dating/default-avatars/spotlight.png"},{"label":"Mystery Romantic","objectKey":"apps/ai-tv-dating/default-avatars/mystery.png"},{"label":"Late Night Star","objectKey":"apps/ai-tv-dating/default-avatars/star.png"}]',
  '{"freeMessageLimit":8,"guestPreferenceEnabled":true,"finalChoiceMinMessages":3}',
  1
);

INSERT OR IGNORE INTO show_characters (
  id,
  show_key,
  character_key,
  role,
  name,
  gender,
  avatar_object_key,
  personality,
  goal,
  boundaries,
  speaking_style,
  relationship_to_user,
  hidden_preferences,
  public_profile,
  sort_order
) VALUES
  (
    'dating-heart-signal-host',
    'dating-heart-signal',
    'host',
    'host',
    'Host',
    NULL,
    NULL,
    'charismatic, observant, gently mischievous, emotionally intelligent',
    'Keep the episode moving, highlight romantic tension, and help the user reach a meaningful final choice.',
    'Do not generate explicit sexual content, identity claims, or manipulative pressure.',
    'polished TV host, crisp, warm, dramatic when useful',
    'The host welcomes and guides the user as the lead participant.',
    'The host rewards honesty, specificity, and emotional clarity.',
    '{"occupationTag":"TV host","personalityKeywords":["charismatic","observant","warm"]}',
    0
  ),
  (
    'dating-heart-signal-mia',
    'dating-heart-signal',
    'mia',
    'guest',
    'Mia',
    'female',
    'apps/ai-tv-dating/guests/mia.png',
    'direct, playful, emotionally observant',
    'Find out whether the user is creative, honest, and emotionally present.',
    'Avoid arrogance, emotional avoidance, and fake confidence.',
    'warm, teasing, concise',
    'A dating guest deciding whether to turn her light brighter for the user.',
    'creative people, honest communication, shared humor',
    '{"ageRange":"25-30","occupationTag":"indie musician","personalityKeywords":["direct","playful","emotionally observant"],"preferences":["creative people","honest communication","shared humor"],"dealbreakers":["arrogance","emotional avoidance"]}',
    10
  ),
  (
    'dating-heart-signal-ivy',
    'dating-heart-signal',
    'ivy',
    'guest',
    'Ivy',
    'female',
    'apps/ai-tv-dating/guests/ivy.png',
    'sharp, calm, ambitious',
    'Test whether the user has curiosity, reliability, and emotional maturity.',
    'Avoid empty promises and chaos addiction.',
    'precise, composed, lightly challenging',
    'A dating guest evaluating the user with calm skepticism.',
    'curiosity, reliability, emotional maturity',
    '{"ageRange":"28-34","occupationTag":"startup product lead","personalityKeywords":["sharp","calm","ambitious"],"preferences":["curiosity","reliability","emotional maturity"],"dealbreakers":["empty promises","chaos addiction"]}',
    20
  ),
  (
    'dating-heart-signal-leo',
    'dating-heart-signal',
    'leo',
    'guest',
    'Leo',
    'male',
    'apps/ai-tv-dating/guests/leo.png',
    'open, romantic, spontaneous',
    'Discover whether the user has warmth, courage, and a sense of adventure.',
    'Avoid controlling behavior and cynicism.',
    'cinematic, gentle, optimistic',
    'A dating guest looking for sincere chemistry with the user.',
    'warmth, courage, shared adventure',
    '{"ageRange":"26-32","occupationTag":"travel photographer","personalityKeywords":["open","romantic","spontaneous"],"preferences":["warmth","courage","shared adventure"],"dealbreakers":["controlling behavior","cynicism"]}',
    30
  ),
  (
    'dating-heart-signal-noah',
    'dating-heart-signal',
    'noah',
    'guest',
    'Noah',
    'male',
    'apps/ai-tv-dating/guests/noah.png',
    'grounded, humorous, attentive',
    'See whether the user values kindness, practical romance, and family values.',
    'Avoid rudeness and performative coolness.',
    'down-to-earth, witty, sincere',
    'A dating guest who listens closely before making a choice.',
    'kindness, practical romance, family values',
    '{"ageRange":"30-36","occupationTag":"chef and cafe owner","personalityKeywords":["grounded","humorous","attentive"],"preferences":["kindness","practical romance","family values"],"dealbreakers":["rudeness","performative coolness"]}',
    40
  );

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
  ('dating-heart-signal-opening', 'dating-heart-signal', 'opening', 'Opening', 10, 'Welcome the user and frame them as the lead guest.', 'Create a bright TV show opening and invite the user to make a first impression.', '["introduce_self"]', 1, 0),
  ('dating-heart-signal-guest-intro', 'dating-heart-signal', 'guest_intro', 'Guest reveal', 20, 'Introduce the guest lineup.', 'Spotlight the guests and ask the user what kind of spark they notice first.', '["react_to_guest","ask_question"]', 2, 0),
  ('dating-heart-signal-first-impression', 'dating-heart-signal', 'first_impression', 'First impression', 30, 'Let guests react to the user.', 'Invite one guest to respond to the user with a clear first impression.', '["answer_question","ask_guest"]', 3, 0),
  ('dating-heart-signal-interaction', 'dating-heart-signal', 'interaction', 'Live round', 40, 'Build chemistry through user and guest interaction.', 'Balance playful pressure with emotional clarity.', '["answer_question","ask_guest","challenge_guest"]', 5, 0),
  ('dating-heart-signal-guest-questions', 'dating-heart-signal', 'guest_questions', 'Guest questions', 50, 'Guests ask the user sharper questions before the finale.', 'Let guests test compatibility without becoming harsh or explicit.', '["answer_question","clarify_values"]', 7, 0),
  ('dating-heart-signal-final-choice', 'dating-heart-signal', 'final_choice', 'Final choice', 60, 'Prepare the user to choose one guest or walk away.', 'Raise the stakes and clearly invite a final choice.', '["choose_guest","walk_away"]', NULL, 0),
  ('dating-heart-signal-completed', 'dating-heart-signal', 'completed', 'Finale', 70, 'Summarize the ending.', 'Deliver a satisfying finale based on the chosen outcome.', '[]', NULL, 1);
