-- spec-040: scene-owned story authoring, task progress, and story invite.

CREATE TABLE scene_stories (
  id             TEXT PRIMARY KEY,
  scene_id       TEXT NOT NULL REFERENCES scenes(id),
  owner_user_id  TEXT REFERENCES users(id),
  title          TEXT NOT NULL,
  synopsis       TEXT,
  source_type    TEXT NOT NULL DEFAULT 'user_written',
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_scene_stories_scene_active
  ON scene_stories (scene_id, is_active, source_type, updated_at);

CREATE INDEX idx_scene_stories_owner
  ON scene_stories (owner_user_id, is_active, updated_at);

CREATE TABLE scene_story_tasks (
  id              TEXT PRIMARY KEY,
  story_id        TEXT NOT NULL REFERENCES scene_stories(id) ON DELETE CASCADE,
  task_order      INTEGER NOT NULL,
  title           TEXT NOT NULL,
  objective       TEXT NOT NULL,
  ai_guidance     TEXT NOT NULL,
  completion_hint TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  UNIQUE (story_id, task_order)
);

CREATE INDEX idx_scene_story_tasks_story_order
  ON scene_story_tasks (story_id, is_active, task_order);

CREATE TABLE user_scene_story_progress (
  user_id            TEXT NOT NULL REFERENCES users(id),
  story_id           TEXT NOT NULL REFERENCES scene_stories(id),
  companion_id       TEXT NOT NULL REFERENCES companions(id),
  current_task_id    TEXT REFERENCES scene_story_tasks(id),
  completed_task_ids TEXT NOT NULL DEFAULT '[]',
  updated_at         INTEGER NOT NULL,
  PRIMARY KEY (user_id, story_id, companion_id)
);

CREATE INDEX idx_user_scene_story_progress_story
  ON user_scene_story_progress (story_id, companion_id, updated_at);
