-- spec-008: tunable event trigger templates.

CREATE TABLE event_templates (
  id                  TEXT PRIMARY KEY,
  event_type          TEXT NOT NULL,
  companion_filter    TEXT NOT NULL DEFAULT 'all',
  trigger_probability REAL NOT NULL,
  cooldown_seconds    INTEGER NOT NULL,
  priority            INTEGER NOT NULL DEFAULT 0,

  min_closeness       INTEGER,
  min_trust           INTEGER,
  min_romance         INTEGER,
  min_friendship      INTEGER,

  max_hostility       INTEGER,
  max_tension         INTEGER,
  max_distance        INTEGER,

  signal_trigger      TEXT,
  options_json        TEXT NOT NULL,
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,

  UNIQUE(event_type, companion_filter)
);

CREATE INDEX idx_event_templates_active ON event_templates(is_active, event_type);
CREATE INDEX idx_event_templates_filter ON event_templates(companion_filter, is_active);
