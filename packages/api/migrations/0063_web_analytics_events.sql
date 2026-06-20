-- Web analytics event stream for the v1 product funnel.
-- Stores only whitelisted event metadata; no IP, full user agent, email, chat text, or raw search text.

CREATE TABLE IF NOT EXISTS analytics_events (
  id              TEXT PRIMARY KEY,
  event_name      TEXT NOT NULL,
  anonymous_id    TEXT NOT NULL,
  user_id         TEXT REFERENCES users(id),
  session_id      TEXT,
  occurred_at     INTEGER NOT NULL,
  received_at     INTEGER NOT NULL,
  route_name      TEXT,
  properties_json TEXT NOT NULL DEFAULT '{}',
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  referrer_domain TEXT
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_received ON analytics_events(received_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_received ON analytics_events(event_name, received_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_received ON analytics_events(user_id, received_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_anonymous_received ON analytics_events(anonymous_id, received_at);
