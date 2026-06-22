-- Advertising attribution fields for paid acquisition reporting.

ALTER TABLE analytics_events ADD COLUMN utm_content TEXT;
ALTER TABLE analytics_events ADD COLUMN utm_term TEXT;
ALTER TABLE analytics_events ADD COLUMN gclid TEXT;
ALTER TABLE analytics_events ADD COLUMN gbraid TEXT;
ALTER TABLE analytics_events ADD COLUMN wbraid TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_events_utm_received
  ON analytics_events(utm_source, utm_campaign, received_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_gclid_received
  ON analytics_events(gclid, received_at);
