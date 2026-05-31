-- spec-025 Part B (S-ε): unlock system data model.
--
-- `last_stage` records the stage we last processed for a relationship, so the
-- unlock detector in applySignals can tell when a stage transition happened.
-- `relationship_unlocks` records what each (user, companion) pair has unlocked,
-- giving us permanent achievement semantics + dedup for celebrations.

ALTER TABLE relationships ADD COLUMN last_stage TEXT;

CREATE TABLE IF NOT EXISTS relationship_unlocks (
  user_id      TEXT    NOT NULL REFERENCES users(id),
  companion_id TEXT    NOT NULL REFERENCES companions(id),
  unlock_key   TEXT    NOT NULL,  -- 'secret' | 'expr:<emotion>' | 'title:<stage>' | ...
  unlocked_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, companion_id, unlock_key)
);

CREATE INDEX IF NOT EXISTS idx_relationship_unlocks_pair
  ON relationship_unlocks (user_id, companion_id);
