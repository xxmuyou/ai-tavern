-- spec-037: chat quick actions (coffee / flowers) need structured metadata on
-- the completed gift activity that backs relationship and memory side effects.

ALTER TABLE activity_contexts ADD COLUMN metadata TEXT;

CREATE INDEX idx_activities_quick_gift_cooldown
ON activity_contexts(user_id, companion_id, activity_type, started_at);
