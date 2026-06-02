-- spec-026: generic companion story beat framework.
--
-- Story beats are authored, reusable narrative hooks attached to companions.
-- Scenes are the stage; the companion remains the gameplay focus.

CREATE TABLE companion_story_beats (
  id                TEXT PRIMARY KEY,
  companion_id      TEXT NOT NULL REFERENCES companions(id),
  beat_order        INTEGER NOT NULL,
  title             TEXT NOT NULL,
  stage_gate        TEXT NOT NULL,
  scene_id          TEXT REFERENCES scenes(id),
  opener            TEXT NOT NULL,
  objective         TEXT NOT NULL,
  reward_unlock_key TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        INTEGER NOT NULL,
  UNIQUE (companion_id, beat_order)
);

CREATE INDEX idx_story_beats_companion_order
  ON companion_story_beats (companion_id, is_active, beat_order);

CREATE INDEX idx_story_beats_scene
  ON companion_story_beats (scene_id, is_active);

CREATE TABLE user_story_progress (
  user_id            TEXT NOT NULL REFERENCES users(id),
  companion_id       TEXT NOT NULL REFERENCES companions(id),
  current_beat_id    TEXT REFERENCES companion_story_beats(id),
  completed_beat_ids TEXT NOT NULL DEFAULT '[]',
  updated_at         INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id)
);

CREATE INDEX idx_story_progress_companion
  ON user_story_progress (companion_id, updated_at);

INSERT INTO companion_story_beats (
  id, companion_id, beat_order, title, stage_gate, scene_id,
  opener, objective, reward_unlock_key, is_active, created_at
)
VALUES
  (
    'maya_beat_01_sketchbook',
    'maya',
    1,
    'The Unfinished Sketch',
    'first_contact',
    'pier_coffee_shop',
    'Maya keeps glancing between her sketchbook and the window, like she is trying to decide whether to hide the page before you notice.',
    'Notice the sketch without pushing too hard; let Maya decide how much to show.',
    NULL,
    1,
    unixepoch() * 1000
  ),
  (
    'maya_beat_02_small_exhibition',
    'maya',
    2,
    'A Place She Almost Mentions',
    'familiar',
    'brookside_bookshop',
    'Maya has a folded gallery flyer tucked inside her book, and she looks almost annoyed that you saw it.',
    'Earn enough trust for Maya to admit why this exhibition matters to her.',
    NULL,
    1,
    unixepoch() * 1000
  ),
  (
    'maya_beat_03_private_doubt',
    'maya',
    3,
    'The Private Doubt',
    'trusted',
    'pier_coffee_shop',
    'Maya starts to say something about her last city, then stops and smooths the corner of her sketchbook instead.',
    'Create a safe moment for Maya to talk about the doubt she carries.',
    'story:maya:private_doubt',
    1,
    unixepoch() * 1000
  ),
  (
    'ryan_beat_01_late_run',
    'ryan',
    1,
    'The Late Run',
    'first_contact',
    'sky_office',
    'Ryan is packing up later than everyone else, one running shoe already unlaced under his desk.',
    'Ask what he is training for without turning it into small talk.',
    NULL,
    1,
    unixepoch() * 1000
  ),
  (
    'ryan_beat_02_reliable_one',
    'ryan',
    2,
    'The Reliable One',
    'familiar',
    'twin_pines_park',
    'Ryan notices you before you call out, slowing his run with a tired smile that does not quite reach his eyes.',
    'Let Ryan be honest about being depended on, instead of immediately asking him to fix something.',
    NULL,
    1,
    unixepoch() * 1000
  ),
  (
    'lila_beat_01_last_call',
    'lila',
    1,
    'Last Call Smile',
    'first_contact',
    'moon_bar',
    'Lila sets a glass down in front of you before you order, watching to see whether you notice the choice.',
    'Show Lila you can read the room without pretending to read her.',
    NULL,
    1,
    unixepoch() * 1000
  ),
  (
    'lila_beat_02_station_story',
    'lila',
    2,
    'The Station Story',
    'trusted',
    'harbor_market',
    'Lila pauses near a stall selling old train postcards, and for once her silence looks less like control.',
    'Give Lila room to tell a story she usually turns into a joke.',
    'story:lila:station_story',
    1,
    unixepoch() * 1000
  );
