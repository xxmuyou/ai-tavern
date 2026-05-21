-- spec-008: make events usable by both scenes and chat-triggered conflicts.
--
-- D1/SQLite cannot drop NOT NULL from scene_id in place, so rebuild the table.

CREATE TABLE events_new (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  companion_id       TEXT NOT NULL REFERENCES companions(id),
  scene_id           TEXT REFERENCES scenes(id),
  event_type         TEXT NOT NULL,
  template_id        TEXT,
  template_snapshot  TEXT NOT NULL,
  payload            TEXT,
  metadata           TEXT,
  status             TEXT NOT NULL DEFAULT 'pending',
  resolution         TEXT,
  created_at         INTEGER NOT NULL,
  resolved_at        INTEGER
);

INSERT INTO events_new (
  id, user_id, companion_id, scene_id, event_type,
  template_id, template_snapshot, payload, metadata,
  status, resolution, created_at, resolved_at
)
SELECT
  id, user_id, companion_id, scene_id, event_type,
  NULL,
  '{"version":1,"template_id":"","event_type":"invitation","companion_filter":"all","options":[]}',
  payload,
  NULL,
  status, resolution, created_at, resolved_at
FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX idx_events_user_companion ON events(user_id, companion_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_user_status_created ON events(user_id, status, created_at);
CREATE INDEX idx_events_pending_companion ON events(user_id, companion_id, status);
