-- spec-029: user-created story arcs and reusable story pack templates.

CREATE TABLE companion_story_arcs (
  id                 TEXT PRIMARY KEY,
  companion_id       TEXT NOT NULL REFERENCES companions(id),
  owner_user_id      TEXT REFERENCES users(id),
  title              TEXT NOT NULL,
  source_type        TEXT NOT NULL,
  template_id        TEXT,
  outline            TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  shared_with_public INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX idx_story_arcs_companion_active
  ON companion_story_arcs (companion_id, is_active, created_at);

CREATE INDEX idx_story_arcs_owner
  ON companion_story_arcs (owner_user_id, is_active, updated_at);

CREATE TABLE story_arc_templates (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  relationship_role TEXT,
  description       TEXT NOT NULL,
  beat_blueprint    TEXT NOT NULL,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_story_arc_templates_active
  ON story_arc_templates (is_active, title);

INSERT INTO companion_story_arcs (
  id, companion_id, owner_user_id, title, source_type, template_id, outline,
  is_active, shared_with_public, created_at, updated_at
)
SELECT
  'official_seed:' || companion_id,
  companion_id,
  NULL,
  'Opening Story',
  'official_seed',
  NULL,
  NULL,
  1,
  1,
  MIN(created_at),
  unixepoch() * 1000
FROM companion_story_beats
GROUP BY companion_id;

-- The spec-026 table had UNIQUE(companion_id, beat_order). User-created arcs
-- need each arc to start at beat 1, so rebuild the table with arc-scoped order.
CREATE TABLE user_story_progress_backup AS
SELECT user_id, companion_id, current_beat_id, completed_beat_ids, updated_at
FROM user_story_progress;

CREATE TABLE story_moment_images_backup AS
SELECT id, user_id, companion_id, thread_id, message_id, scene_id, activity_id,
       story_beat_id, emotion, prompt_snapshot, job_id, output_key, status,
       created_at, updated_at
FROM story_moment_images;

CREATE TABLE companion_story_beats_new (
  id                 TEXT PRIMARY KEY,
  companion_id       TEXT NOT NULL REFERENCES companions(id),
  arc_id             TEXT REFERENCES companion_story_arcs(id),
  created_by_user_id TEXT REFERENCES users(id),
  beat_order         INTEGER NOT NULL,
  title              TEXT NOT NULL,
  stage_gate         TEXT NOT NULL,
  scene_id           TEXT REFERENCES scenes(id),
  opener             TEXT NOT NULL,
  objective          TEXT NOT NULL,
  reward_unlock_key  TEXT,
  source_type        TEXT NOT NULL DEFAULT 'official_seed',
  is_user_editable   INTEGER NOT NULL DEFAULT 0,
  completion_mode    TEXT NOT NULL DEFAULT 'manual',
  is_active          INTEGER NOT NULL DEFAULT 1,
  created_at         INTEGER NOT NULL,
  UNIQUE (arc_id, beat_order)
);

INSERT INTO companion_story_beats_new (
  id, companion_id, arc_id, created_by_user_id, beat_order, title, stage_gate,
  scene_id, opener, objective, reward_unlock_key, source_type, is_user_editable,
  completion_mode, is_active, created_at
)
SELECT
  id,
  companion_id,
  'official_seed:' || companion_id,
  NULL,
  beat_order,
  title,
  stage_gate,
  scene_id,
  opener,
  objective,
  reward_unlock_key,
  'official_seed',
  0,
  'auto',
  is_active,
  created_at
FROM companion_story_beats;

DROP TABLE user_story_progress;
DROP TABLE story_moment_images;
DROP TABLE companion_story_beats;
ALTER TABLE companion_story_beats_new RENAME TO companion_story_beats;

CREATE INDEX idx_story_beats_companion_order
  ON companion_story_beats (companion_id, is_active, beat_order);

CREATE INDEX idx_story_beats_scene
  ON companion_story_beats (scene_id, is_active);

CREATE INDEX idx_story_beats_arc_order
  ON companion_story_beats (arc_id, is_active, beat_order);

CREATE TABLE user_story_progress (
  user_id            TEXT NOT NULL REFERENCES users(id),
  companion_id       TEXT NOT NULL REFERENCES companions(id),
  current_beat_id    TEXT REFERENCES companion_story_beats(id),
  completed_beat_ids TEXT NOT NULL DEFAULT '[]',
  updated_at         INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);

INSERT INTO user_story_progress
  (user_id, companion_id, current_beat_id, completed_beat_ids, updated_at)
SELECT user_id, companion_id, current_beat_id, completed_beat_ids, updated_at
FROM user_story_progress_backup;

DROP TABLE user_story_progress_backup;

CREATE INDEX idx_story_progress_companion
  ON user_story_progress (companion_id, updated_at);

CREATE TABLE story_moment_images (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  companion_id    TEXT NOT NULL REFERENCES companions(id),
  thread_id       TEXT NOT NULL REFERENCES threads(id),
  message_id      TEXT NOT NULL REFERENCES messages(id),
  scene_id        TEXT REFERENCES scenes(id),
  activity_id     TEXT REFERENCES activity_contexts(id),
  story_beat_id   TEXT REFERENCES companion_story_beats(id),
  emotion         TEXT,
  prompt_snapshot TEXT NOT NULL,
  job_id          TEXT NOT NULL REFERENCES image_generation_jobs(id),
  output_key      TEXT,
  status          TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (user_id, message_id)
);

INSERT INTO story_moment_images
  (id, user_id, companion_id, thread_id, message_id, scene_id, activity_id,
   story_beat_id, emotion, prompt_snapshot, job_id, output_key, status,
   created_at, updated_at)
SELECT id, user_id, companion_id, thread_id, message_id, scene_id, activity_id,
       story_beat_id, emotion, prompt_snapshot, job_id, output_key, status,
       created_at, updated_at
FROM story_moment_images_backup;

DROP TABLE story_moment_images_backup;

CREATE INDEX idx_story_moment_images_message ON story_moment_images (message_id);
CREATE INDEX idx_story_moment_images_job ON story_moment_images (job_id);

INSERT INTO story_arc_templates (
  id, title, relationship_role, description, beat_blueprint, is_active, created_at, updated_at
)
VALUES
  (
    'slow_burn_romance',
    'Slow Burn Romance',
    'crush',
    'A guarded attraction that grows through small, honest moments.',
    '[{"title":"A Reason to Stay","stage_gate":"first_contact","scene_hint":"cafe","opener":"They seem ready to leave, but something about your arrival makes them pause.","objective":"Find one sincere reason for them to stay a little longer."},{"title":"The Almost-Invite","stage_gate":"familiar","scene_hint":"park","opener":"They mention a place they usually visit alone, then act like it was nothing.","objective":"Let them decide whether this becomes an invitation."},{"title":"What They Do Not Say","stage_gate":"trusted","scene_hint":"quiet place","opener":"A small silence opens between you, warmer than the conversation before it.","objective":"Make room for a vulnerable truth without demanding it."},{"title":"Crossing the Line Softly","stage_gate":"romantic_tension","scene_hint":"evening scene","opener":"The air changes after a joke lands too honestly.","objective":"Name the tension gently, or choose to let it breathe."}]',
    1,
    unixepoch() * 1000,
    unixepoch() * 1000
  ),
  (
    'healing_trust',
    'Healing Trust',
    'friend',
    'A careful bond about consistency, repair, and earning safety.',
    '[{"title":"A Small Boundary","stage_gate":"first_contact","scene_hint":"daily scene","opener":"They answer politely, but one topic makes them go still.","objective":"Notice the boundary and show you can respect it."},{"title":"Showing Up Twice","stage_gate":"familiar","scene_hint":"routine place","opener":"They look surprised that you remembered something ordinary.","objective":"Prove care through consistency, not a grand gesture."},{"title":"The Bad Day","stage_gate":"trusted","scene_hint":"private corner","opener":"Their composure slips for a second before they rebuild it.","objective":"Stay present without trying to fix everything."},{"title":"Choosing Trust","stage_gate":"close_friend","scene_hint":"safe place","opener":"They ask for your opinion, and this time it matters.","objective":"Help them choose what kind of trust they want from you."}]',
    1,
    unixepoch() * 1000,
    unixepoch() * 1000
  ),
  (
    'workplace_tension',
    'Workplace Tension',
    'colleague',
    'Professional friction turns into a private understanding.',
    '[{"title":"The Missed Cue","stage_gate":"first_contact","scene_hint":"workplace","opener":"They correct one small detail before anyone else notices.","objective":"Show whether you take precision as criticism or care."},{"title":"After Hours","stage_gate":"familiar","scene_hint":"office","opener":"The place is almost empty, and their professional mask finally loosens.","objective":"Learn what pressure they carry when no one is watching."},{"title":"A Risky Favor","stage_gate":"trusted","scene_hint":"workplace","opener":"They ask for help in a way that sounds more like a test than a request.","objective":"Decide what kind of support you can offer without overstepping."},{"title":"The Unspoken Rule","stage_gate":"romantic_tension","scene_hint":"city night","opener":"A shared victory leaves both of you standing too close to call it accidental.","objective":"Acknowledge the pull while respecting the line between you."}]',
    1,
    unixepoch() * 1000,
    unixepoch() * 1000
  ),
  (
    'mystery_stranger',
    'Mystery Stranger',
    'stranger',
    'A new connection built around withheld truths and careful reveals.',
    '[{"title":"The Wrong Name","stage_gate":"first_contact","scene_hint":"public place","opener":"They almost respond to a name that is not theirs.","objective":"Notice the inconsistency without cornering them."},{"title":"Pattern of Absence","stage_gate":"familiar","scene_hint":"transit or market","opener":"They appear exactly when you stop expecting them.","objective":"Ask what keeps pulling them away."},{"title":"One True Detail","stage_gate":"trusted","scene_hint":"quiet place","opener":"They offer one fact about themselves like it costs more than a confession.","objective":"Treat the truth as a gift, not a clue to exploit."},{"title":"Stay or Vanish","stage_gate":"close_friend","scene_hint":"threshold","opener":"For once, they look like they are waiting for you to choose first.","objective":"Give them a reason to stay without demanding a promise."}]',
    1,
    unixepoch() * 1000,
    unixepoch() * 1000
  );

INSERT OR IGNORE INTO llm_config
  (task, provider, model, fallback_provider, fallback_model, updated_at, updated_by)
VALUES
  ('story_beat_assist', 'deepseek', 'deepseek-chat', 'openai', 'gpt-4o-mini', unixepoch() * 1000, NULL);
